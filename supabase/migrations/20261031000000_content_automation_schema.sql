-- Kangrooo content automation: property inventory, rotation, weekly generation
-- cycles, creatives + revisions + clips, publishing safeguards, performance.
--
-- Source of truth: docs/architecture/content_automation.md (design + rotation
-- algorithm) and docs/Proposed-data-model.md. 12 NEW tables:
--   properties, property_images, property_legacy_content,
--   content_automation_settings, content_generation_cycles,
--   content_generation_queue, property_promotions, property_content,
--   content_revisions, content_clips, publishing_logs, content_performance
-- plus an extended `social_posts` (existing table, not counted).
--
-- Design rules enforced here (not just in app code):
--   * Testing content lives ONLY in property_content / content_revisions /
--     content_clips / media_assets. It never gets a social_posts row.
--   * social_posts automation rows are always environment = 'live', created
--     only from a valid, current revision of Live content.
--   * Environment is immutable on every table that carries it.
--   * Business ownership is enforced by composite foreign keys, not trust.
--   * History is never cascaded away: every history FK is RESTRICT or SET NULL.
--   * Claim functions re-check mode / enabled / property / revision /
--     validation / connection / lateness atomically; they are service-role only.
--
-- Requires PostgreSQL 15+ (ON DELETE SET NULL (column_list)).
-- Purely additive except `social_posts` (new nullable columns, widened CHECKs,
-- and its write policy narrowed to manual rows).

-- ============================================================
-- 0. Shared helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Rejects any UPDATE that changes the named column.
-- Usage: EXECUTE FUNCTION forbid_column_change('environment')
CREATE OR REPLACE FUNCTION public.forbid_column_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF to_jsonb(NEW) -> TG_ARGV[0] IS DISTINCT FROM to_jsonb(OLD) -> TG_ARGV[0] THEN
        RAISE EXCEPTION '%.% is immutable after creation', TG_TABLE_NAME, TG_ARGV[0]
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- True for the service role / direct DB connections / SECURITY DEFINER bodies;
-- false for end-user (PostgREST authenticated/anon) sessions.
CREATE OR REPLACE FUNCTION public.is_service_context()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT current_user NOT IN ('authenticated', 'anon');
$$;

CREATE OR REPLACE FUNCTION public.is_business_admin(p_business UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM business_users
        WHERE business_id = p_business AND user_id = auth.uid() AND role IN ('owner', 'admin'));
$$;

-- D4: the single place the lateness window is defined.
CREATE OR REPLACE FUNCTION public.content_publish_max_lateness()
RETURNS INTERVAL LANGUAGE sql IMMUTABLE AS $$ SELECT interval '6 hours' $$;

-- ============================================================
-- 1. properties — the inventory (330 rows proposed for import)
-- ============================================================

CREATE TABLE properties (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    -- Stable import identity. Two source titles are duplicated across
    -- different properties, so title cannot be the key.
    source_key          TEXT NOT NULL,
    source_row          INT,
    import_batch        TEXT,
    title               TEXT NOT NULL,
    space_category      TEXT,
    event_types         TEXT[] NOT NULL DEFAULT '{}',
    event_types_raw     TEXT,
    -- Location: the source has a city name only. Never guess the rest.
    location_raw        TEXT,
    city                TEXT,
    region              TEXT,
    country             TEXT,
    timezone            TEXT,
    location_verified   TEXT NOT NULL DEFAULT 'unverified',
    status              TEXT NOT NULL DEFAULT 'active',
    -- Source spreadsheet columns kept verbatim (content_status, blog_type, ...).
    legacy_fields       JSONB NOT NULL DEFAULT '{}',
    -- Append-only rotation order, assigned by insert order and never supplied
    -- by callers (ALWAYS: an explicit value would leave the sequence behind and
    -- collide with later inserts). The import must insert in source-row order.
    rotation_seq        BIGINT GENERATED ALWAYS AS IDENTITY,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_properties_source_key UNIQUE (business_id, source_key),
    CONSTRAINT uq_properties_rotation_seq UNIQUE (business_id, rotation_seq),
    CONSTRAINT uq_properties_id_business UNIQUE (id, business_id),
    CONSTRAINT chk_properties_status CHECK (status IN ('active', 'inactive')),
    CONSTRAINT chk_properties_location_verified
        CHECK (location_verified IN ('unverified', 'verified', 'ambiguous'))
);
CREATE INDEX idx_properties_rotation ON properties(business_id, rotation_seq) WHERE status = 'active';
CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_properties_business_immutable BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION public.forbid_column_change('business_id');

-- ============================================================
-- 2. property_images — up to 5 reference URLs per property
-- ============================================================

CREATE TABLE property_images (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL,
    property_id         UUID NOT NULL,
    position            SMALLINT NOT NULL,
    url                 TEXT NOT NULL,
    media_asset_id      UUID REFERENCES media_assets(id) ON DELETE SET NULL,
    -- D8: unchecked images are eligible; only 'broken' disqualifies. Validation
    -- happens at generation time.
    validation_status   TEXT NOT NULL DEFAULT 'unchecked',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_property_images_position UNIQUE (property_id, position),
    CONSTRAINT chk_property_images_position CHECK (position BETWEEN 1 AND 5),
    CONSTRAINT chk_property_images_validation CHECK (validation_status IN ('unchecked', 'ok', 'broken')),
    CONSTRAINT fk_property_images_property FOREIGN KEY (property_id, business_id)
        REFERENCES properties(id, business_id) ON DELETE CASCADE
);

-- ============================================================
-- 3. property_legacy_content — imported spreadsheet history, read-only.
--    No FK into social_posts / content tables: no path into publishing.
-- ============================================================

CREATE TABLE property_legacy_content (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    property_id         UUID,
    property_title_raw  TEXT NOT NULL,
    kind                TEXT NOT NULL,
    source_sheet        TEXT NOT NULL,
    source_row          INT NOT NULL,
    source_key          TEXT NOT NULL,
    url                 TEXT,
    caption             TEXT,
    hashtags            TEXT,
    source_status       TEXT,
    source_created_at   DATE,
    raw                 JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_property_legacy_source UNIQUE (business_id, source_key),
    CONSTRAINT chk_property_legacy_content_kind CHECK (kind IN ('blog', 'image_post', 'video')),
    CONSTRAINT fk_property_legacy_property FOREIGN KEY (property_id, business_id)
        REFERENCES properties(id, business_id) ON DELETE SET NULL (property_id)
);
CREATE INDEX idx_property_legacy_content_property ON property_legacy_content(property_id);

-- ============================================================
-- 4. content_automation_settings — one row per business
-- ============================================================

CREATE TABLE content_automation_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id                 UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE RESTRICT,
    -- D6: 0 disables a pipeline; 14/week max each.
    social_frequency_per_week   SMALLINT NOT NULL DEFAULT 0,
    linkedin_frequency_per_week SMALLINT NOT NULL DEFAULT 0,
    -- The CURRENTLY SELECTED mode. The immutable environment lives on records.
    automation_mode             TEXT NOT NULL DEFAULT 'testing',
    -- false = paused. Defaults off so creating the row never starts anything.
    is_enabled                  BOOLEAN NOT NULL DEFAULT false,
    -- D10: business-level FALLBACK only; verified property/audience timezones win.
    generation_timezone         TEXT NOT NULL DEFAULT 'America/Toronto',
    -- A5: maintained by trigger; client-supplied values are ignored.
    mode_changed_at             TIMESTAMPTZ,
    mode_changed_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_cas_social_freq CHECK (social_frequency_per_week BETWEEN 0 AND 14),
    CONSTRAINT chk_cas_linkedin_freq CHECK (linkedin_frequency_per_week BETWEEN 0 AND 14),
    CONSTRAINT chk_cas_mode CHECK (automation_mode IN ('testing', 'live'))
);
CREATE TRIGGER trg_cas_updated_at BEFORE UPDATE ON content_automation_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5. content_generation_cycles — one per business / environment / week
-- ============================================================

CREATE TABLE content_generation_cycles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id             UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    environment             TEXT NOT NULL,
    week_start              DATE NOT NULL,
    week_end                DATE GENERATED ALWAYS AS (week_start + 6) STORED,
    status                  TEXT NOT NULL DEFAULT 'pending',
    social_target_count     SMALLINT NOT NULL DEFAULT 0,
    linkedin_target_count   SMALLINT NOT NULL DEFAULT 0,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cycles_week UNIQUE (business_id, environment, week_start),
    CONSTRAINT uq_cycles_id_business UNIQUE (id, business_id),
    CONSTRAINT chk_cycles_environment CHECK (environment IN ('testing', 'live')),
    -- A9: weeks start on Monday (ISO).
    CONSTRAINT chk_cycles_week_monday CHECK (EXTRACT(ISODOW FROM week_start) = 1),
    CONSTRAINT chk_cycles_targets CHECK (social_target_count BETWEEN 0 AND 14 AND linkedin_target_count BETWEEN 0 AND 14),
    -- 'incomplete' = finished with some failed jobs; 'failed' = nothing succeeded.
    CONSTRAINT chk_cycles_status CHECK (status IN ('pending', 'running', 'completed', 'incomplete', 'failed', 'cancelled'))
);
CREATE TRIGGER trg_cycles_updated_at BEFORE UPDATE ON content_generation_cycles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cycles_env_immutable BEFORE UPDATE ON content_generation_cycles
    FOR EACH ROW EXECUTE FUNCTION public.forbid_column_change('environment');
CREATE TRIGGER trg_cycles_business_immutable BEFORE UPDATE ON content_generation_cycles
    FOR EACH ROW EXECUTE FUNCTION public.forbid_column_change('business_id');

-- ============================================================
-- 6. content_generation_queue — one job per planned creative.
--    Environment is inherited from the cycle (no column of its own).
-- ============================================================

CREATE TABLE content_generation_queue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL,
    cycle_id            UUID NOT NULL,
    -- Chosen by claim_property_for_job(); NULL until then. A retry reuses it.
    property_id         UUID,
    pipeline_type       TEXT NOT NULL,
    slot_index          SMALLINT NOT NULL,
    content_type        TEXT,
    generation_status   TEXT NOT NULL DEFAULT 'pending',
    generation_attempts SMALLINT NOT NULL DEFAULT 0,
    max_attempts        SMALLINT NOT NULL DEFAULT 3,
    next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_by           TEXT,
    locked_until        TIMESTAMPTZ,
    -- Step-level progress (script written, format chosen, revision id, ...).
    -- Individual clip records live in content_clips, the source of truth.
    generation_state    JSONB NOT NULL DEFAULT '{}',
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    CONSTRAINT uq_queue_slot UNIQUE (cycle_id, pipeline_type, slot_index),
    CONSTRAINT uq_queue_id_business UNIQUE (id, business_id),
    CONSTRAINT chk_queue_pipeline CHECK (pipeline_type IN ('social', 'linkedin')),
    CONSTRAINT chk_queue_status CHECK (generation_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT chk_queue_content_type CHECK (
        content_type IS NULL
        OR (pipeline_type = 'social' AND content_type IN ('video', 'image'))
        OR (pipeline_type = 'linkedin' AND content_type = 'text_image')
    ),
    CONSTRAINT fk_queue_cycle FOREIGN KEY (cycle_id, business_id)
        REFERENCES content_generation_cycles(id, business_id) ON DELETE CASCADE,
    CONSTRAINT fk_queue_property FOREIGN KEY (property_id, business_id)
        REFERENCES properties(id, business_id) ON DELETE RESTRICT
);
CREATE INDEX idx_queue_claimable ON content_generation_queue(next_attempt_at)
    WHERE generation_status IN ('pending', 'processing');

-- ============================================================
-- 7. property_promotions — rotation ledger, separate per environment.
--    claimed → generated | failed | released. Only 'generated' counts as a
--    successful promotion. History survives deletion of cycles / jobs (A1).
-- ============================================================

CREATE TABLE property_promotions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL,
    property_id     UUID NOT NULL,
    environment     TEXT NOT NULL,
    pipeline_type   TEXT NOT NULL,
    cycle_id        UUID,
    queue_id        UUID UNIQUE,
    status          TEXT NOT NULL DEFAULT 'claimed',
    failure_reason  TEXT,
    claimed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    generated_at    TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    CONSTRAINT chk_pp_environment CHECK (environment IN ('testing', 'live')),
    CONSTRAINT chk_pp_pipeline CHECK (pipeline_type IN ('social', 'linkedin')),
    CONSTRAINT chk_pp_status CHECK (status IN ('claimed', 'generated', 'failed', 'released')),
    CONSTRAINT chk_pp_generated_at CHECK ((status = 'generated') = (generated_at IS NOT NULL)),
    CONSTRAINT fk_pp_property FOREIGN KEY (property_id, business_id)
        REFERENCES properties(id, business_id) ON DELETE RESTRICT,
    CONSTRAINT fk_pp_cycle FOREIGN KEY (cycle_id, business_id)
        REFERENCES content_generation_cycles(id, business_id) ON DELETE SET NULL (cycle_id),
    CONSTRAINT fk_pp_queue FOREIGN KEY (queue_id, business_id)
        REFERENCES content_generation_queue(id, business_id) ON DELETE SET NULL (queue_id)
);
CREATE INDEX idx_pp_rotation ON property_promotions(business_id, environment, property_id, status);
CREATE TRIGGER trg_pp_env_immutable BEFORE UPDATE ON property_promotions
    FOR EACH ROW EXECUTE FUNCTION public.forbid_column_change('environment');

-- ============================================================
-- 8. property_content — the creative (one per queue job).
--    Script / caption / media live on revisions; this row is identity + pointer.
-- ============================================================

CREATE TABLE property_content (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL,
    property_id         UUID NOT NULL,
    cycle_id            UUID,
    queue_id            UUID UNIQUE,
    pipeline_type       TEXT NOT NULL,
    content_type        TEXT NOT NULL,
    environment         TEXT NOT NULL,
    generation_status   TEXT NOT NULL DEFAULT 'pending',
    -- Moves only to a VALID revision (guard trigger). Publishing re-checks it.
    current_revision_id UUID,
    -- Explicit archival instead of deletion.
    archived_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_pc_id_business UNIQUE (id, business_id),
    CONSTRAINT chk_pc_pipeline CHECK (pipeline_type IN ('social', 'linkedin')),
    CONSTRAINT chk_pc_environment CHECK (environment IN ('testing', 'live')),
    CONSTRAINT chk_pc_status CHECK (generation_status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    -- LinkedIn never gets video; social never gets text_image.
    CONSTRAINT chk_pc_content_type CHECK (
        (pipeline_type = 'social' AND content_type IN ('video', 'image'))
        OR (pipeline_type = 'linkedin' AND content_type = 'text_image')
    ),
    CONSTRAINT fk_pc_property FOREIGN KEY (property_id, business_id)
        REFERENCES properties(id, business_id) ON DELETE RESTRICT,
    CONSTRAINT fk_pc_cycle FOREIGN KEY (cycle_id, business_id)
        REFERENCES content_generation_cycles(id, business_id) ON DELETE SET NULL (cycle_id),
    CONSTRAINT fk_pc_queue FOREIGN KEY (queue_id, business_id)
        REFERENCES content_generation_queue(id, business_id) ON DELETE SET NULL (queue_id)
);
CREATE INDEX idx_pc_business_created ON property_content(business_id, created_at DESC);
CREATE INDEX idx_pc_property ON property_content(property_id);
CREATE TRIGGER trg_pc_updated_at BEFORE UPDATE ON property_content
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pc_env_immutable BEFORE UPDATE ON property_content
    FOR EACH ROW EXECUTE FUNCTION public.forbid_column_change('environment');
CREATE TRIGGER trg_pc_business_immutable BEFORE UPDATE ON property_content
    FOR EACH ROW EXECUTE FUNCTION public.forbid_column_change('business_id');

-- ============================================================
-- 9. content_revisions — every version of a creative
-- ============================================================

CREATE TABLE content_revisions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL,
    property_content_id UUID NOT NULL,
    revision_number     INT NOT NULL,
    script              TEXT,
    caption             TEXT,
    hashtags            TEXT[] NOT NULL DEFAULT '{}',
    media_asset_id      UUID REFERENCES media_assets(id) ON DELETE SET NULL,
    video_format        TEXT,
    video_duration      NUMERIC(6,2),
    format_reason       TEXT,
    generation_prompt   TEXT,
    -- A new revision is not publishable until it validates (guard trigger).
    validation_status   TEXT NOT NULL DEFAULT 'pending',
    validation_errors   JSONB,
    validated_at        TIMESTAMPTZ,
    created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_revisions_number UNIQUE (property_content_id, revision_number),
    -- Target of composite FKs from property_content / social_posts / content_clips
    -- so "this revision belongs to that creative" is declarative.
    CONSTRAINT uq_revisions_id_content UNIQUE (id, property_content_id),
    CONSTRAINT chk_revisions_video_format CHECK (video_format IS NULL OR video_format IN ('single_30s', 'two_clip_40s')),
    CONSTRAINT chk_revisions_validation CHECK (validation_status IN ('pending', 'valid', 'invalid')),
    CONSTRAINT fk_revisions_content FOREIGN KEY (property_content_id, business_id)
        REFERENCES property_content(id, business_id) ON DELETE CASCADE
);
CREATE INDEX idx_revisions_content ON content_revisions(property_content_id, revision_number DESC);

ALTER TABLE property_content
    ADD CONSTRAINT fk_pc_current_revision FOREIGN KEY (current_revision_id, id)
    REFERENCES content_revisions(id, property_content_id) ON DELETE SET NULL (current_revision_id);

-- ============================================================
-- 10. content_clips — per-clip state of a video revision (A7).
--     single_30s → 1 clip; two_clip_40s → 2 clips. A completed clip is
--     immutable, so a retry after "clip 1 ok, clip 2 failed" reuses clip 1.
-- ============================================================

CREATE TABLE content_clips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL,
    property_content_id UUID NOT NULL,
    revision_id         UUID NOT NULL,
    clip_index          SMALLINT NOT NULL,
    provider            TEXT NOT NULL DEFAULT 'kie',
    provider_task_id    TEXT,
    status              TEXT NOT NULL DEFAULT 'pending',
    media_asset_id      UUID REFERENCES media_assets(id) ON DELETE SET NULL,
    duration_seconds    NUMERIC(6,2),
    request_params      JSONB NOT NULL DEFAULT '{}',
    attempts            SMALLINT NOT NULL DEFAULT 0,
    max_attempts        SMALLINT NOT NULL DEFAULT 3,
    last_error          TEXT,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_clips_revision_index UNIQUE (revision_id, clip_index),
    CONSTRAINT chk_clips_index CHECK (clip_index IN (1, 2)),
    CONSTRAINT chk_clips_status CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT chk_clips_completed_media CHECK (status <> 'completed' OR media_asset_id IS NOT NULL),
    CONSTRAINT fk_clips_revision FOREIGN KEY (revision_id, property_content_id)
        REFERENCES content_revisions(id, property_content_id) ON DELETE CASCADE,
    CONSTRAINT fk_clips_content FOREIGN KEY (property_content_id, business_id)
        REFERENCES property_content(id, business_id) ON DELETE CASCADE
);
-- One provider task can only ever back one clip.
CREATE UNIQUE INDEX uq_clips_provider_task ON content_clips(provider, provider_task_id)
    WHERE provider_task_id IS NOT NULL;
CREATE TRIGGER trg_clips_updated_at BEFORE UPDATE ON content_clips
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.content_clips_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'completed' AND (
           NEW.status <> 'completed'
        OR NEW.media_asset_id IS DISTINCT FROM OLD.media_asset_id
        OR NEW.provider_task_id IS DISTINCT FROM OLD.provider_task_id
        OR NEW.clip_index <> OLD.clip_index
        OR NEW.revision_id <> OLD.revision_id) THEN
        RAISE EXCEPTION 'a completed clip is immutable; create a new revision to regenerate it'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
        NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_clips_guard BEFORE UPDATE ON content_clips
    FOR EACH ROW EXECUTE FUNCTION public.content_clips_guard();

-- Idempotent "get or create this clip row". A worker calls it per clip; a clip
-- that is already 'completed' comes back untouched (reuse), never regenerated.
CREATE OR REPLACE FUNCTION public.ensure_content_clip(p_revision UUID, p_index SMALLINT)
RETURNS content_clips LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r content_revisions%ROWTYPE; c content_clips%ROWTYPE;
BEGIN
    SELECT * INTO r FROM content_revisions WHERE id = p_revision;
    IF NOT FOUND THEN RAISE EXCEPTION 'revision % not found', p_revision; END IF;
    INSERT INTO content_clips (business_id, property_content_id, revision_id, clip_index)
    VALUES (r.business_id, r.property_content_id, r.id, p_index)
    ON CONFLICT (revision_id, clip_index) DO NOTHING;
    SELECT * INTO c FROM content_clips WHERE revision_id = p_revision AND clip_index = p_index;
    RETURN c;
END;
$$;

-- ---- revision guard: validation requires real artifacts; valid is frozen ----

CREATE OR REPLACE FUNCTION public.content_revisions_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE ctype TEXT; expected INT;
BEGIN
    IF OLD.validation_status = 'valid' AND (
           NEW.script IS DISTINCT FROM OLD.script
        OR NEW.caption IS DISTINCT FROM OLD.caption
        OR NEW.hashtags IS DISTINCT FROM OLD.hashtags
        OR NEW.media_asset_id IS DISTINCT FROM OLD.media_asset_id
        OR NEW.video_format IS DISTINCT FROM OLD.video_format
        OR NEW.video_duration IS DISTINCT FROM OLD.video_duration) THEN
        RAISE EXCEPTION 'a validated revision is immutable; create a new revision'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.validation_status = 'valid' AND OLD.validation_status IS DISTINCT FROM 'valid' THEN
        SELECT content_type INTO ctype FROM property_content WHERE id = NEW.property_content_id;
        IF NEW.media_asset_id IS NULL THEN
            RAISE EXCEPTION 'cannot validate a revision without its final media'
                USING ERRCODE = 'check_violation';
        END IF;
        IF ctype = 'video' THEN
            IF NEW.video_format IS NULL OR NEW.video_duration IS NULL THEN
                RAISE EXCEPTION 'cannot validate a video revision without video_format and video_duration'
                    USING ERRCODE = 'check_violation';
            END IF;
            expected := CASE NEW.video_format WHEN 'single_30s' THEN 1 ELSE 2 END;
            IF (SELECT count(*) FROM content_clips
                 WHERE revision_id = NEW.id AND status = 'completed'
                   AND media_asset_id IS NOT NULL AND clip_index <= expected) <> expected THEN
                RAISE EXCEPTION 'cannot validate: all % clip(s) must be completed', expected
                    USING ERRCODE = 'check_violation';
            END IF;
        ELSIF ctype = 'text_image' AND COALESCE(btrim(NEW.caption), '') = '' THEN
            RAISE EXCEPTION 'cannot validate a LinkedIn revision without text'
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.validated_at := now();
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_revisions_guard BEFORE UPDATE ON content_revisions
    FOR EACH ROW EXECUTE FUNCTION public.content_revisions_guard();

-- ---- property_content guard: the current-revision pointer ----

CREATE OR REPLACE FUNCTION public.property_content_pointer_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.current_revision_id IS NOT NULL
       AND NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id THEN
        IF (SELECT validation_status FROM content_revisions WHERE id = NEW.current_revision_id) <> 'valid' THEN
            RAISE EXCEPTION 'current_revision_id can only point to a valid revision'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.environment = 'live' AND EXISTS (
               SELECT 1 FROM social_posts
                WHERE property_content_id = NEW.id
                  AND status IN ('scheduled', 'held', 'publishing', 'published')) THEN
            RAISE EXCEPTION 'live content with active posts cannot switch revision'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
-- (social_posts gets its new columns below; the function body is only
--  resolved at execution time, so creating the trigger first is safe.)

-- ============================================================
-- 11. Extend social_posts — the canonical LIVE publishing record
--     (D3: no Testing rows). All additions nullable / defaulted, so existing
--     manual rows are untouched (property_content_id IS NULL ⇒ manual).
-- ============================================================

ALTER TABLE social_posts
    ADD COLUMN IF NOT EXISTS property_content_id    UUID,
    ADD COLUMN IF NOT EXISTS content_revision_id    UUID,
    ADD COLUMN IF NOT EXISTS platform               TEXT,
    ADD COLUMN IF NOT EXISTS environment            TEXT,
    ADD COLUMN IF NOT EXISTS hashtags               TEXT[],
    ADD COLUMN IF NOT EXISTS platform_metadata      JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS schedule_timezone      TEXT,
    ADD COLUMN IF NOT EXISTS platform_post_id       TEXT,
    -- A8: stable per-post key, written to every publishing_logs attempt.
    ADD COLUMN IF NOT EXISTS idempotency_key        UUID,
    ADD COLUMN IF NOT EXISTS publish_attempt_count  SMALLINT NOT NULL DEFAULT 0,
    -- Attempts before this number belong to an earlier (manual) retry round.
    ADD COLUMN IF NOT EXISTS retry_base_attempt     SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_attempt_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS publish_started_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS locked_by              TEXT,
    ADD COLUMN IF NOT EXISTS locked_until           TIMESTAMPTZ,
    -- Request sent, outcome not confirmed. Never auto-retried.
    ADD COLUMN IF NOT EXISTS publish_outcome_unknown BOOLEAN NOT NULL DEFAULT false;

-- Existing statuses stay legal ('review'/'approved' for old rows); added:
-- held (paused / mode change), cancelled, skipped. NO 'gallery_only' (D3).
ALTER TABLE social_posts DROP CONSTRAINT chk_social_posts_status;
ALTER TABLE social_posts ADD CONSTRAINT chk_social_posts_status
    CHECK (status IN ('generating', 'draft', 'review', 'approved', 'scheduled', 'held',
                      'publishing', 'published', 'failed', 'cancelled', 'skipped'));

ALTER TABLE social_posts DROP CONSTRAINT chk_social_posts_format;
ALTER TABLE social_posts ADD CONSTRAINT chk_social_posts_format
    CHECK (format IN ('video', 'image', 'text', 'text_image') OR format IS NULL);

ALTER TABLE social_posts
    ADD CONSTRAINT uq_social_posts_id_business UNIQUE (id, business_id),
    ADD CONSTRAINT chk_social_posts_platform
        CHECK (platform IS NULL OR platform IN ('tiktok', 'instagram', 'facebook', 'linkedin')),
    -- Automation rows are Live, always. Manual rows carry no environment.
    ADD CONSTRAINT chk_social_posts_environment
        CHECK (environment IS NULL OR environment = 'live'),
    ADD CONSTRAINT chk_social_posts_automation_shape
        CHECK ((property_content_id IS NULL) = (environment IS NULL)
               AND (property_content_id IS NULL OR
                    (platform IS NOT NULL AND content_revision_id IS NOT NULL AND idempotency_key IS NOT NULL))),
    ADD CONSTRAINT fk_social_posts_content FOREIGN KEY (property_content_id, business_id)
        REFERENCES property_content(id, business_id) ON DELETE RESTRICT,
    -- The pinned revision must belong to that creative.
    ADD CONSTRAINT fk_social_posts_revision FOREIGN KEY (content_revision_id, property_content_id)
        REFERENCES content_revisions(id, property_content_id) ON DELETE RESTRICT;

-- One platform record per creative: 3 for social, 1 for LinkedIn.
CREATE UNIQUE INDEX uq_social_posts_content_platform
    ON social_posts(property_content_id, platform) WHERE property_content_id IS NOT NULL;
CREATE UNIQUE INDEX uq_social_posts_idempotency ON social_posts(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_social_posts_due_live ON social_posts(scheduled_at)
    WHERE status = 'scheduled' AND property_content_id IS NOT NULL;
CREATE INDEX idx_social_posts_content ON social_posts(property_content_id);

CREATE TRIGGER trg_pc_pointer_guard BEFORE UPDATE OF current_revision_id ON property_content
    FOR EACH ROW EXECUTE FUNCTION public.property_content_pointer_guard();

-- ---- social_posts automation guard (insert rules, immutability, state machine) ----

CREATE OR REPLACE FUNCTION public.social_posts_automation_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    pc   property_content%ROWTYPE;
    rev  content_revisions%ROWTYPE;
    conn_business UUID;
    conn_platform TEXT;
    expected_format TEXT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.property_content_id IS NULL AND NEW.property_content_id IS NOT NULL THEN
            RAISE EXCEPTION 'a manual post cannot be converted into an automation post'
                USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.property_content_id IS NOT NULL THEN
            IF NEW.property_content_id IS DISTINCT FROM OLD.property_content_id
               OR NEW.platform IS DISTINCT FROM OLD.platform
               OR NEW.environment IS DISTINCT FROM OLD.environment
               OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
               OR NEW.business_id IS DISTINCT FROM OLD.business_id THEN
                RAISE EXCEPTION 'automation post identity (content, platform, environment, key) is immutable'
                    USING ERRCODE = 'check_violation';
            END IF;
            IF OLD.status IN ('publishing', 'published')
               AND NEW.content_revision_id IS DISTINCT FROM OLD.content_revision_id THEN
                RAISE EXCEPTION 'cannot change the revision of a post that is publishing/published'
                    USING ERRCODE = 'check_violation';
            END IF;
            -- State machine. published / skipped / cancelled are terminal.
            IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
                   (OLD.status = 'scheduled'  AND NEW.status IN ('held', 'publishing', 'skipped', 'cancelled'))
                OR (OLD.status = 'held'       AND NEW.status IN ('scheduled', 'skipped', 'cancelled'))
                OR (OLD.status = 'publishing' AND NEW.status IN ('published', 'failed', 'scheduled', 'held', 'skipped'))
                OR (OLD.status = 'failed'     AND NEW.status IN ('scheduled', 'cancelled'))) THEN
                RAISE EXCEPTION 'illegal social_posts transition % -> %', OLD.status, NEW.status
                    USING ERRCODE = 'check_violation';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- INSERT
    IF NEW.property_content_id IS NULL THEN
        RETURN NEW;  -- manual post: nothing to enforce here
    END IF;

    SELECT * INTO pc FROM property_content WHERE id = NEW.property_content_id;
    IF pc.environment <> 'live' THEN
        RAISE EXCEPTION 'Testing content can never create a publishing record'
            USING ERRCODE = 'check_violation';
    END IF;
    IF pc.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'archived content cannot be published' USING ERRCODE = 'check_violation';
    END IF;
    IF pc.current_revision_id IS DISTINCT FROM NEW.content_revision_id THEN
        RAISE EXCEPTION 'a post must pin the creative''s current revision' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO rev FROM content_revisions WHERE id = NEW.content_revision_id;
    IF rev.validation_status <> 'valid' THEN
        RAISE EXCEPTION 'only a validated revision can be scheduled' USING ERRCODE = 'check_violation';
    END IF;

    -- pipeline ↔ platform ↔ format
    IF pc.pipeline_type = 'linkedin' AND NEW.platform <> 'linkedin' THEN
        RAISE EXCEPTION 'LinkedIn content can only target linkedin' USING ERRCODE = 'check_violation';
    END IF;
    IF pc.pipeline_type = 'social' AND NEW.platform NOT IN ('tiktok', 'instagram', 'facebook') THEN
        RAISE EXCEPTION 'social content targets tiktok / instagram / facebook only' USING ERRCODE = 'check_violation';
    END IF;
    expected_format := CASE pc.content_type WHEN 'video' THEN 'video' WHEN 'image' THEN 'image' ELSE 'text_image' END;
    IF NEW.format IS DISTINCT FROM expected_format THEN
        RAISE EXCEPTION 'post format % does not match content type % (expected %)',
            NEW.format, pc.content_type, expected_format USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status NOT IN ('scheduled', 'held') THEN
        RAISE EXCEPTION 'automation posts are created scheduled (or held while paused)'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.scheduled_at IS NULL OR NEW.schedule_timezone IS NULL THEN
        RAISE EXCEPTION 'automation posts need scheduled_at (UTC) and schedule_timezone'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.connection_id IS NULL THEN
        RAISE EXCEPTION 'automation posts need a platform connection' USING ERRCODE = 'check_violation';
    END IF;
    SELECT business_id, platform::text INTO conn_business, conn_platform
      FROM platform_connections WHERE id = NEW.connection_id;
    IF conn_business IS DISTINCT FROM NEW.business_id OR conn_platform IS DISTINCT FROM NEW.platform THEN
        RAISE EXCEPTION 'connection does not belong to this business / platform' USING ERRCODE = 'check_violation';
    END IF;

    NEW.environment := 'live';
    NEW.idempotency_key := COALESCE(NEW.idempotency_key, gen_random_uuid());
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_social_posts_automation_guard
    BEFORE INSERT OR UPDATE ON social_posts
    FOR EACH ROW EXECUTE FUNCTION public.social_posts_automation_guard();

-- Deleting a platform connection cascades to MANUAL posts (existing
-- behaviour) but must never delete automation history: detach instead.
CREATE OR REPLACE FUNCTION public.platform_connections_detach_automation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE social_posts SET connection_id = NULL
     WHERE connection_id = OLD.id AND property_content_id IS NOT NULL;
    RETURN OLD;
END;
$$;
CREATE TRIGGER trg_platform_connections_detach_automation
    BEFORE DELETE ON platform_connections
    FOR EACH ROW EXECUTE FUNCTION public.platform_connections_detach_automation();

-- ============================================================
-- 12. publishing_logs — one auditable row per attempt
-- ============================================================

CREATE TABLE publishing_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL,
    social_post_id      UUID NOT NULL,
    attempt_number      SMALLINT NOT NULL,
    status              TEXT NOT NULL,
    idempotency_key     UUID,
    request_metadata    JSONB NOT NULL DEFAULT '{}',
    response_metadata   JSONB NOT NULL DEFAULT '{}',
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at         TIMESTAMPTZ,
    CONSTRAINT uq_publishing_logs_attempt UNIQUE (social_post_id, attempt_number),
    CONSTRAINT chk_publishing_logs_status
        CHECK (status IN ('started', 'succeeded', 'failed', 'unknown', 'blocked')),
    CONSTRAINT fk_publishing_logs_post FOREIGN KEY (social_post_id, business_id)
        REFERENCES social_posts(id, business_id) ON DELETE RESTRICT
);
-- At most ONE open attempt per post: the single-flight guarantee.
CREATE UNIQUE INDEX uq_publishing_logs_one_open ON publishing_logs(social_post_id) WHERE status = 'started';

-- ============================================================
-- 13. content_performance — nullable metrics, never fabricated
-- ============================================================

CREATE TABLE content_performance (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL,
    social_post_id  UUID NOT NULL,
    impressions     INT,
    reach           INT,
    likes           INT,
    comments        INT,
    shares          INT,
    clicks          INT,
    collected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_content_performance_snapshot UNIQUE (social_post_id, collected_at),
    CONSTRAINT fk_content_performance_post FOREIGN KEY (social_post_id, business_id)
        REFERENCES social_posts(id, business_id) ON DELETE RESTRICT
);
CREATE INDEX idx_content_performance_post ON content_performance(social_post_id, collected_at DESC);

-- ============================================================
-- 14. Settings guard: mode-change audit (A5), who may change what (D5),
--     and hold / release of pending Live posts (D9).
-- ============================================================

CREATE OR REPLACE FUNCTION public.content_settings_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT public.is_service_context()
           AND NOT public.is_business_admin(NEW.business_id)
           AND (NEW.automation_mode <> 'testing' OR NEW.is_enabled) THEN
            RAISE EXCEPTION 'only owners/admins can enable automation or select Live mode'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        NEW.mode_changed_at := NULL;
        NEW.mode_changed_by := NULL;
        RETURN NEW;
    END IF;

    IF NEW.business_id <> OLD.business_id THEN
        RAISE EXCEPTION 'business_id is immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.automation_mode IS DISTINCT FROM OLD.automation_mode
        OR NEW.is_enabled IS DISTINCT FROM OLD.is_enabled)
       AND NOT public.is_service_context()
       AND NOT public.is_business_admin(NEW.business_id) THEN
        RAISE EXCEPTION 'only owners/admins can change the automation mode or pause/resume automation'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.automation_mode IS DISTINCT FROM OLD.automation_mode THEN
        NEW.mode_changed_at := now();
        NEW.mode_changed_by := auth.uid();          -- NULL when the service role did it
    ELSE
        NEW.mode_changed_at := OLD.mode_changed_at;  -- ignore client-supplied audit values
        NEW.mode_changed_by := OLD.mode_changed_by;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_cas_guard BEFORE INSERT OR UPDATE ON content_automation_settings
    FOR EACH ROW EXECUTE FUNCTION public.content_settings_guard();

-- Revalidating release of held posts. Used on resume; safe to call repeatedly.
CREATE OR REPLACE FUNCTION public.release_held_posts(p_business UUID)
RETURNS TABLE (released INT, skipped INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_reason TEXT; v_rel INT := 0; v_skip INT := 0;
BEGIN
    -- Only meaningful while automation is actually Live and enabled; otherwise
    -- posts stay held (never skipped just because someone called this early).
    IF NOT EXISTS (SELECT 1 FROM content_automation_settings
                    WHERE business_id = p_business AND is_enabled AND automation_mode = 'live') THEN
        released := 0; skipped := 0;
        RETURN NEXT; RETURN;
    END IF;
    FOR r IN SELECT id FROM social_posts
              WHERE business_id = p_business AND status = 'held' AND property_content_id IS NOT NULL
              ORDER BY scheduled_at FOR UPDATE LOOP
        v_reason := public.publish_block_reason(r.id, 'held', false);
        IF v_reason IS NULL OR v_reason LIKE 'connection\_%' THEN
            -- Connection trouble is re-checked at claim time; the post will be
            -- skipped by the lateness sweep if it never recovers.
            UPDATE social_posts SET status = 'scheduled', next_attempt_at = now(), error_message = NULL
             WHERE id = r.id;
            v_rel := v_rel + 1;
        ELSE
            UPDATE social_posts SET status = 'skipped', error_message = 'not publishable on resume: ' || v_reason
             WHERE id = r.id;
            v_skip := v_skip + 1;
        END IF;
    END LOOP;
    released := v_rel; skipped := v_skip;
    RETURN NEXT;
END;
$$;

-- SECURITY DEFINER: an admin switching mode through the API must be able to
-- hold/release posts even though RLS forbids users from touching automation rows.
CREATE OR REPLACE FUNCTION public.content_settings_hold_release()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE was_live BOOLEAN; now_live BOOLEAN;
BEGIN
    was_live := OLD.automation_mode = 'live' AND OLD.is_enabled;
    now_live := NEW.automation_mode = 'live' AND NEW.is_enabled;
    IF was_live AND NOT now_live THEN
        -- D9: hold (not cancel) pending Live posts. In-flight 'publishing'
        -- posts are not interrupted; their pre-call re-check decides.
        UPDATE social_posts SET status = 'held'
         WHERE business_id = NEW.business_id AND property_content_id IS NOT NULL AND status = 'scheduled';
    ELSIF now_live AND NOT was_live THEN
        PERFORM public.release_held_posts(NEW.business_id);
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_cas_hold_release AFTER UPDATE ON content_automation_settings
    FOR EACH ROW EXECUTE FUNCTION public.content_settings_hold_release();

-- ============================================================
-- 15. Queue ↔ promotions ↔ cycle consistency (A2)
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_cycle_status(p_cycle UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE open_jobs INT; failed_jobs INT; done_jobs INT;
BEGIN
    SELECT count(*) FILTER (WHERE generation_status IN ('pending', 'processing')),
           count(*) FILTER (WHERE generation_status = 'failed'),
           count(*) FILTER (WHERE generation_status = 'completed')
      INTO open_jobs, failed_jobs, done_jobs
      FROM content_generation_queue WHERE cycle_id = p_cycle;
    IF open_jobs > 0 THEN RETURN; END IF;
    UPDATE content_generation_cycles
       SET status = CASE WHEN failed_jobs = 0 AND done_jobs > 0 THEN 'completed'
                         WHEN done_jobs = 0 AND failed_jobs > 0 THEN 'failed'
                         WHEN failed_jobs > 0 THEN 'incomplete'
                         ELSE status END,
           completed_at = COALESCE(completed_at, now())
     WHERE id = p_cycle AND status IN ('pending', 'running')
       AND (failed_jobs > 0 OR done_jobs > 0);
END;
$$;

-- A job can only complete when its creative really exists with a valid
-- current revision: "successfully generated", not merely "claimed".
CREATE OR REPLACE FUNCTION public.queue_completion_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.generation_status = 'completed' AND OLD.generation_status <> 'completed' THEN
        IF NOT EXISTS (SELECT 1 FROM property_content
                        WHERE queue_id = NEW.id AND generation_status = 'completed'
                          AND current_revision_id IS NOT NULL) THEN
            RAISE EXCEPTION 'job % cannot complete: no completed creative with a valid revision', NEW.id
                USING ERRCODE = 'check_violation';
        END IF;
        NEW.completed_at := COALESCE(NEW.completed_at, now());
        NEW.locked_by := NULL; NEW.locked_until := NULL;
    END IF;
    IF NEW.generation_status = 'failed' AND OLD.generation_status <> 'failed' THEN
        NEW.completed_at := COALESCE(NEW.completed_at, now());
        NEW.locked_by := NULL; NEW.locked_until := NULL;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_queue_completion_guard BEFORE UPDATE ON content_generation_queue
    FOR EACH ROW EXECUTE FUNCTION public.queue_completion_guard();

CREATE OR REPLACE FUNCTION public.queue_status_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.generation_status = OLD.generation_status THEN RETURN NEW; END IF;
    IF NEW.generation_status = 'completed' THEN
        UPDATE property_promotions SET status = 'generated', generated_at = now(), resolved_at = now()
         WHERE queue_id = NEW.id AND status = 'claimed';
    ELSIF NEW.generation_status = 'failed' THEN
        UPDATE property_promotions SET status = 'failed', resolved_at = now(),
               failure_reason = COALESCE(NEW.error_message, 'generation job failed')
         WHERE queue_id = NEW.id AND status = 'claimed';
    ELSIF NEW.generation_status = 'cancelled' THEN
        UPDATE property_promotions SET status = 'released', resolved_at = now(),
               failure_reason = 'generation job cancelled'
         WHERE queue_id = NEW.id AND status = 'claimed';
    END IF;
    IF NEW.generation_status IN ('completed', 'failed', 'cancelled') THEN
        PERFORM public.refresh_cycle_status(NEW.cycle_id);
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_queue_status_sync AFTER UPDATE OF generation_status ON content_generation_queue
    FOR EACH ROW EXECUTE FUNCTION public.queue_status_sync();

-- ============================================================
-- 16. Derived rotation / content statistics (A6) — nothing stored
-- ============================================================

CREATE VIEW property_promotion_stats WITH (security_invoker = true) AS
WITH env(environment) AS (VALUES ('testing'), ('live')),
promo AS (
    SELECT property_id, environment,
           count(*) FILTER (WHERE status = 'generated')                                   AS generated_count,
           count(*) FILTER (WHERE status = 'generated' AND pipeline_type = 'social')      AS social_generated_count,
           count(*) FILTER (WHERE status = 'generated' AND pipeline_type = 'linkedin')    AS linkedin_generated_count,
           count(*) FILTER (WHERE status = 'failed')                                      AS failed_generation_count,
           count(*) FILTER (WHERE status = 'claimed')                                     AS in_flight_count,
           max(generated_at)                                                              AS last_generated_at,
           max(generated_at) FILTER (WHERE pipeline_type = 'social')                      AS last_social_generated_at,
           max(generated_at) FILTER (WHERE pipeline_type = 'linkedin')                    AS last_linkedin_generated_at
      FROM property_promotions GROUP BY property_id, environment),
cont AS (
    SELECT property_id, environment,
           count(*) FILTER (WHERE generation_status = 'completed' AND archived_at IS NULL) AS content_count
      FROM property_content GROUP BY property_id, environment),
pub AS (
    SELECT pc.property_id, pc.environment,
           count(DISTINCT pc.id) FILTER (WHERE sp.status = 'published') AS published_content_count,
           max(sp.published_at)                                         AS last_published_at
      FROM property_content pc JOIN social_posts sp ON sp.property_content_id = pc.id
     GROUP BY pc.property_id, pc.environment)
SELECT p.id AS property_id, p.business_id, e.environment,
       COALESCE(promo.generated_count, 0)            AS generated_count,
       COALESCE(promo.social_generated_count, 0)     AS social_generated_count,
       COALESCE(promo.linkedin_generated_count, 0)   AS linkedin_generated_count,
       COALESCE(promo.failed_generation_count, 0)    AS failed_generation_count,
       COALESCE(promo.in_flight_count, 0)            AS in_flight_count,
       promo.last_generated_at, promo.last_social_generated_at, promo.last_linkedin_generated_at,
       COALESCE(cont.content_count, 0)               AS content_count,
       COALESCE(pub.published_content_count, 0)      AS published_content_count,
       pub.last_published_at
  FROM properties p
 CROSS JOIN env e
  LEFT JOIN promo ON promo.property_id = p.id AND promo.environment = e.environment
  LEFT JOIN cont  ON cont.property_id  = p.id AND cont.environment  = e.environment
  LEFT JOIN pub   ON pub.property_id   = p.id AND pub.environment   = e.environment;

-- ============================================================
-- 17. Rotation: the property selection algorithm (D7, D8)
--     Documented in docs/architecture/content_automation.md §Rotation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_property_for_job(p_queue UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q content_generation_queue%ROWTYPE; c content_generation_cycles%ROWTYPE; v_prop UUID;
BEGIN
    SELECT * INTO q FROM content_generation_queue WHERE id = p_queue FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'queue job % not found', p_queue; END IF;
    IF q.property_id IS NOT NULL THEN RETURN q.property_id; END IF;   -- retry keeps its property
    SELECT * INTO c FROM content_generation_cycles WHERE id = q.cycle_id;

    -- Serialize selection per (business, environment) so concurrent jobs cannot pick the same property.
    PERFORM pg_advisory_xact_lock(hashtextextended(c.business_id::text || ':' || c.environment, 0));

    SELECT p.id INTO v_prop
      FROM properties p
     WHERE p.business_id = c.business_id
       AND p.status = 'active'
       AND EXISTS (SELECT 1 FROM property_images i
                    WHERE i.property_id = p.id AND i.validation_status <> 'broken')
     ORDER BY
        -- 1. not already being generated for this environment by another job
        EXISTS (SELECT 1 FROM property_promotions x
                 WHERE x.property_id = p.id AND x.environment = c.environment AND x.status = 'claimed'),
        -- 2. not already used in this cycle (while alternatives remain)
        EXISTS (SELECT 1 FROM property_promotions x
                 WHERE x.property_id = p.id AND x.cycle_id = q.cycle_id AND x.status IN ('claimed', 'generated')),
        -- 3. shared history: fewest successful promotions in this environment (all pipelines)
        (SELECT count(*) FROM property_promotions x
          WHERE x.property_id = p.id AND x.environment = c.environment AND x.status = 'generated'),
        -- 4. per-pipeline fairness: fewest successful promotions for THIS pipeline
        (SELECT count(*) FROM property_promotions x
          WHERE x.property_id = p.id AND x.environment = c.environment
            AND x.pipeline_type = q.pipeline_type AND x.status = 'generated'),
        -- 5. least recently promoted for this pipeline (never-promoted first)
        (SELECT max(x.generated_at) FROM property_promotions x
          WHERE x.property_id = p.id AND x.environment = c.environment
            AND x.pipeline_type = q.pipeline_type AND x.status = 'generated') NULLS FIRST,
        -- 6. least recently promoted overall
        (SELECT max(x.generated_at) FROM property_promotions x
          WHERE x.property_id = p.id AND x.environment = c.environment AND x.status = 'generated') NULLS FIRST,
        -- 7. import / append order, then id: fully deterministic
        p.rotation_seq, p.id
     LIMIT 1;

    IF v_prop IS NULL THEN RETURN NULL; END IF;

    INSERT INTO property_promotions (business_id, property_id, environment, pipeline_type, cycle_id, queue_id)
    VALUES (c.business_id, v_prop, c.environment, q.pipeline_type, q.cycle_id, q.id)
    ON CONFLICT (queue_id) DO NOTHING;
    UPDATE content_generation_queue SET property_id = v_prop WHERE id = q.id;
    RETURN v_prop;
END;
$$;

-- ============================================================
-- 18. Generation job lifecycle (service role only)
-- ============================================================

-- Idempotently creates the queue slots a cycle's targets call for.
CREATE OR REPLACE FUNCTION public.ensure_cycle_slots(p_cycle UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c content_generation_cycles%ROWTYPE; n INT;
BEGIN
    SELECT * INTO c FROM content_generation_cycles WHERE id = p_cycle;
    IF NOT FOUND THEN RAISE EXCEPTION 'cycle % not found', p_cycle; END IF;
    INSERT INTO content_generation_queue (business_id, cycle_id, pipeline_type, slot_index)
    SELECT c.business_id, c.id, 'social', g FROM generate_series(1, c.social_target_count) g
    UNION ALL
    SELECT c.business_id, c.id, 'linkedin', g FROM generate_series(1, c.linkedin_target_count) g
    ON CONFLICT (cycle_id, pipeline_type, slot_index) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

-- A4 / A10: claims pending jobs and expired leases of the cycle that matches
-- the business's CURRENT mode, while automation is enabled. The settings row
-- is share-locked, so a concurrent mode switch/pause waits for the claim or
-- the claim skips; the worker still re-checks via generation_job_still_valid.
CREATE OR REPLACE FUNCTION public.claim_generation_jobs(
    p_worker TEXT, p_limit INT DEFAULT 5, p_lease INTERVAL DEFAULT '15 minutes')
RETURNS SETOF content_generation_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids UUID[]; v_id UUID;
BEGIN
    -- Expired lease with no attempts left → fail (trigger resolves the promotion claim, A2).
    UPDATE content_generation_queue
       SET generation_status = 'failed',
           error_message = COALESCE(error_message, 'lease expired after max attempts')
     WHERE generation_status = 'processing' AND locked_until < now()
       AND generation_attempts >= max_attempts;

    WITH claimed AS (
        UPDATE content_generation_queue q
           SET generation_status = 'processing',
               generation_attempts = q.generation_attempts + 1,
               locked_by = p_worker,
               locked_until = now() + p_lease,
               started_at = COALESCE(q.started_at, now())
         WHERE q.id IN (
                SELECT q2.id
                  FROM content_generation_queue q2
                  JOIN content_generation_cycles c ON c.id = q2.cycle_id
                  JOIN content_automation_settings s ON s.business_id = c.business_id
                 WHERE s.is_enabled
                   AND c.environment = s.automation_mode
                   AND c.status IN ('pending', 'running')
                   AND q2.generation_attempts < q2.max_attempts
                   AND q2.next_attempt_at <= now()
                   AND (q2.generation_status = 'pending'
                        OR (q2.generation_status = 'processing' AND q2.locked_until < now()))
                 ORDER BY q2.next_attempt_at, q2.created_at
                 LIMIT p_limit
                 FOR UPDATE OF q2 SKIP LOCKED
                 FOR SHARE OF s SKIP LOCKED)
        RETURNING q.id)
    SELECT array_agg(id) INTO v_ids FROM claimed;

    IF v_ids IS NULL THEN RETURN; END IF;

    UPDATE content_generation_cycles SET status = 'running', started_at = COALESCE(started_at, now())
     WHERE status = 'pending'
       AND id IN (SELECT cycle_id FROM content_generation_queue WHERE id = ANY (v_ids));

    -- Deterministic assignment order: social (the larger pipeline) first, then by
    -- slot, so lower slots get the best-ranked properties.
    FOR v_id IN SELECT id FROM content_generation_queue WHERE id = ANY (v_ids)
                 ORDER BY (pipeline_type <> 'social'), slot_index, id LOOP
        IF (SELECT property_id FROM content_generation_queue WHERE id = v_id) IS NULL THEN
            IF public.claim_property_for_job(v_id) IS NULL THEN
                UPDATE content_generation_queue
                   SET generation_status = 'failed', error_message = 'no eligible property'
                 WHERE id = v_id;
            END IF;
        END IF;
    END LOOP;

    RETURN QUERY SELECT * FROM content_generation_queue
                  WHERE id = ANY (v_ids) AND generation_status = 'processing';
END;
$$;

-- Re-check immediately before expensive generation / after long steps.
CREATE OR REPLACE FUNCTION public.generation_job_still_valid(p_queue UUID, p_worker TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM content_generation_queue q
          JOIN content_generation_cycles c ON c.id = q.cycle_id
          JOIN content_automation_settings s ON s.business_id = c.business_id
         WHERE q.id = p_queue AND q.generation_status = 'processing'
           AND q.locked_by = p_worker AND q.locked_until > now()
           AND s.is_enabled AND c.environment = s.automation_mode);
$$;

-- A10: lease renewal for long-running generation.
CREATE OR REPLACE FUNCTION public.renew_generation_lease(
    p_queue UUID, p_worker TEXT, p_lease INTERVAL DEFAULT '15 minutes')
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
    UPDATE content_generation_queue SET locked_until = now() + p_lease
     WHERE id = p_queue AND generation_status = 'processing' AND locked_by = p_worker AND locked_until > now();
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_generation_job(p_queue UUID, p_worker TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
    UPDATE content_generation_queue SET generation_status = 'completed'
     WHERE id = p_queue AND generation_status = 'processing' AND locked_by = p_worker;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RAISE EXCEPTION 'job % is not held by worker %', p_queue, p_worker; END IF;
END;
$$;

-- Known failure: retryable → back to pending with backoff and the lock CLEARED
-- (A10), keeping its property claim; otherwise permanent (promotion → failed).
CREATE OR REPLACE FUNCTION public.fail_generation_job(
    p_queue UUID, p_worker TEXT, p_error TEXT, p_retryable BOOLEAN DEFAULT true)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q content_generation_queue%ROWTYPE;
BEGIN
    SELECT * INTO q FROM content_generation_queue WHERE id = p_queue FOR UPDATE;
    IF NOT FOUND OR q.generation_status <> 'processing' OR q.locked_by IS DISTINCT FROM p_worker THEN
        RAISE EXCEPTION 'job % is not held by worker %', p_queue, p_worker;
    END IF;
    IF p_retryable AND q.generation_attempts < q.max_attempts THEN
        UPDATE content_generation_queue
           SET generation_status = 'pending', locked_by = NULL, locked_until = NULL,
               error_message = left(p_error, 500),
               next_attempt_at = now() + make_interval(mins => 2 * q.generation_attempts)
         WHERE id = p_queue;
        RETURN 'pending';
    END IF;
    UPDATE content_generation_queue
       SET generation_status = 'failed', error_message = left(p_error, 500)
     WHERE id = p_queue;
    RETURN 'failed';
END;
$$;

-- ============================================================
-- 19. Publishing (service role only) — A3, A8, A10, D4, D9
-- ============================================================

-- The ONE definition of "may this post be published right now?".
-- NULL = yes; otherwise a machine-readable reason. Used by the claim, by the
-- worker immediately before the external call, by resume, and by manual retry.
CREATE OR REPLACE FUNCTION public.publish_block_reason(
    p_post_id UUID, p_expect_status TEXT, p_check_due BOOLEAN)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
    sp social_posts%ROWTYPE; pc property_content%ROWTYPE; s content_automation_settings%ROWTYPE;
    v_prop_status TEXT; v_rev_status TEXT; v_conn_status TEXT; v_conn_platform TEXT;
BEGIN
    SELECT * INTO sp FROM social_posts WHERE id = p_post_id;
    IF NOT FOUND THEN RETURN 'post_not_found'; END IF;
    IF sp.property_content_id IS NULL THEN RETURN 'not_an_automation_post'; END IF;
    IF sp.status <> p_expect_status THEN RETURN 'status_' || sp.status; END IF;
    IF sp.environment IS DISTINCT FROM 'live' THEN RETURN 'not_live'; END IF;
    IF sp.publish_outcome_unknown THEN RETURN 'outcome_unknown'; END IF;

    SELECT * INTO pc FROM property_content WHERE id = sp.property_content_id;
    IF pc.environment <> 'live' THEN RETURN 'content_not_live'; END IF;
    IF pc.archived_at IS NOT NULL THEN RETURN 'content_archived'; END IF;

    SELECT * INTO s FROM content_automation_settings WHERE business_id = sp.business_id;
    IF NOT FOUND OR NOT s.is_enabled THEN RETURN 'automation_disabled'; END IF;
    IF s.automation_mode <> 'live' THEN RETURN 'mode_not_live'; END IF;

    SELECT status INTO v_prop_status FROM properties WHERE id = pc.property_id;
    IF v_prop_status IS DISTINCT FROM 'active' THEN RETURN 'property_inactive'; END IF;

    IF pc.current_revision_id IS DISTINCT FROM sp.content_revision_id THEN RETURN 'revision_not_current'; END IF;
    SELECT validation_status INTO v_rev_status FROM content_revisions WHERE id = sp.content_revision_id;
    IF v_rev_status IS DISTINCT FROM 'valid' THEN RETURN 'revision_not_valid'; END IF;

    IF sp.connection_id IS NULL THEN RETURN 'connection_missing'; END IF;
    SELECT status::text, platform::text INTO v_conn_status, v_conn_platform
      FROM platform_connections WHERE id = sp.connection_id;
    IF NOT FOUND THEN RETURN 'connection_missing'; END IF;
    IF v_conn_status <> 'connected' THEN RETURN 'connection_' || v_conn_status; END IF;
    IF v_conn_platform <> sp.platform THEN RETURN 'connection_platform_mismatch'; END IF;

    IF sp.scheduled_at IS NULL THEN RETURN 'no_schedule'; END IF;
    IF now() - sp.scheduled_at > public.content_publish_max_lateness() THEN RETURN 'overdue'; END IF;
    IF p_check_due AND (sp.scheduled_at > now() OR sp.next_attempt_at > now()) THEN RETURN 'not_due'; END IF;
    RETURN NULL;
END;
$$;

-- Claims due posts. A3: anything more than 6 hours late is marked 'skipped'
-- instead of being published in a burst. A8: the claim and its 'started' log
-- row are one atomic statement; the one-open-attempt unique index makes a
-- duplicate claim impossible even across concurrent workers / duplicate events.
CREATE OR REPLACE FUNCTION public.claim_publish_jobs(
    p_worker TEXT, p_limit INT DEFAULT 10, p_lease INTERVAL DEFAULT '10 minutes', p_post_id UUID DEFAULT NULL)
RETURNS SETOF social_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE social_posts
       SET status = 'skipped', locked_by = NULL, locked_until = NULL,
           error_message = 'missed the ' || (public.content_publish_max_lateness())::text || ' publishing window'
     WHERE status = 'scheduled' AND property_content_id IS NOT NULL
       AND scheduled_at < now() - public.content_publish_max_lateness();

    RETURN QUERY
    WITH picked AS (
        SELECT sp2.id FROM social_posts sp2
         WHERE sp2.status = 'scheduled' AND sp2.property_content_id IS NOT NULL
           AND (p_post_id IS NULL OR sp2.id = p_post_id)
           AND sp2.scheduled_at <= now()
           AND public.publish_block_reason(sp2.id, 'scheduled', true) IS NULL
         ORDER BY sp2.scheduled_at
         LIMIT p_limit
         FOR UPDATE OF sp2 SKIP LOCKED),
    claimed AS (
        UPDATE social_posts sp
           SET status = 'publishing',
               publish_attempt_count = sp.publish_attempt_count + 1,
               locked_by = p_worker, locked_until = now() + p_lease,
               publish_started_at = now(), error_message = NULL
          FROM picked WHERE sp.id = picked.id
        RETURNING sp.*),
    logged AS (
        INSERT INTO publishing_logs (business_id, social_post_id, attempt_number, status, idempotency_key, request_metadata)
        SELECT c.business_id, c.id, c.publish_attempt_count, 'started', c.idempotency_key,
               jsonb_build_object('worker', p_worker)
          FROM claimed c
        RETURNING 1)
    SELECT * FROM claimed;
END;
$$;

-- Persist Upload-Post's ids the moment the HTTP response arrives, BEFORE any
-- interpretation, so a crash right after leaves something to reconcile with.
CREATE OR REPLACE FUNCTION public.record_publish_response(
    p_post UUID, p_attempt SMALLINT, p_request_id TEXT DEFAULT NULL, p_job_id TEXT DEFAULT NULL, p_response JSONB DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
    UPDATE social_posts
       SET upload_post_request_id = COALESCE(p_request_id, upload_post_request_id),
           upload_post_job_id = COALESCE(p_job_id, upload_post_job_id)
     WHERE id = p_post AND status = 'publishing' AND publish_attempt_count = p_attempt;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 1 THEN
        UPDATE publishing_logs SET response_metadata = COALESCE(p_response, '{}'::jsonb)
         WHERE social_post_id = p_post AND attempt_number = p_attempt;
    END IF;
    RETURN n = 1;
END;
$$;

-- Ends an attempt. A stale/duplicate finisher (wrong attempt number) is rejected.
--   published → status published
--   failed    → retryable & attempts left: back to 'scheduled' with backoff and
--               the lock cleared (A10); otherwise 'failed'
--   unknown   → stays 'publishing' with publish_outcome_unknown (NEVER auto-retried)
--   blocked   → pre-call re-check failed: held (mode/automation), failed
--               (connection, retry after reconnect) or skipped (no longer publishable)
CREATE OR REPLACE FUNCTION public.finish_publish(
    p_post UUID, p_attempt SMALLINT, p_outcome TEXT,
    p_error TEXT DEFAULT NULL, p_retryable BOOLEAN DEFAULT false,
    p_platform_post_id TEXT DEFAULT NULL, p_response JSONB DEFAULT NULL, p_block_reason TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sp social_posts%ROWTYPE; v_status TEXT; v_log TEXT; v_since INT;
BEGIN
    SELECT * INTO sp FROM social_posts WHERE id = p_post FOR UPDATE;
    IF NOT FOUND OR sp.property_content_id IS NULL THEN RAISE EXCEPTION 'automation post % not found', p_post; END IF;
    IF sp.status <> 'publishing' OR sp.publish_attempt_count <> p_attempt THEN
        RAISE EXCEPTION 'stale publish attempt % for post % (status %, attempt %)',
            p_attempt, p_post, sp.status, sp.publish_attempt_count USING ERRCODE = 'check_violation';
    END IF;
    v_since := sp.publish_attempt_count - sp.retry_base_attempt;

    IF p_outcome = 'published' THEN
        UPDATE social_posts SET status = 'published', published_at = now(), platform_post_id = p_platform_post_id,
               error_message = NULL, locked_by = NULL, locked_until = NULL WHERE id = p_post;
        v_status := 'published'; v_log := 'succeeded';
    ELSIF p_outcome = 'failed' THEN
        IF p_retryable AND v_since < 3 THEN
            UPDATE social_posts SET status = 'scheduled', error_message = left(p_error, 500),
                   next_attempt_at = now() + make_interval(mins => 5 * v_since),
                   locked_by = NULL, locked_until = NULL WHERE id = p_post;
            v_status := 'scheduled';
        ELSE
            UPDATE social_posts SET status = 'failed', error_message = left(p_error, 500),
                   locked_by = NULL, locked_until = NULL WHERE id = p_post;
            v_status := 'failed';
        END IF;
        v_log := 'failed';
    ELSIF p_outcome = 'unknown' THEN
        UPDATE social_posts SET publish_outcome_unknown = true, error_message = left(p_error, 500),
               locked_by = NULL, locked_until = NULL WHERE id = p_post;
        v_status := 'publishing'; v_log := 'unknown';
    ELSIF p_outcome = 'blocked' THEN
        v_status := CASE
            WHEN p_block_reason IN ('automation_disabled', 'mode_not_live') THEN 'held'
            WHEN p_block_reason LIKE 'connection\_%' THEN 'failed'
            ELSE 'skipped' END;
        UPDATE social_posts SET status = v_status, error_message = 'blocked before publish: ' || COALESCE(p_block_reason, 'unknown'),
               locked_by = NULL, locked_until = NULL WHERE id = p_post;
        v_log := 'blocked';
    ELSE
        RAISE EXCEPTION 'unknown outcome %', p_outcome;
    END IF;

    UPDATE publishing_logs
       SET status = v_log, finished_at = now(), error_message = left(p_error, 500),
           response_metadata = COALESCE(p_response, response_metadata)
     WHERE social_post_id = p_post AND attempt_number = p_attempt;
    RETURN v_status;
END;
$$;

-- A worker that dies mid-publish leaves status 'publishing' with an expired
-- lease. We cannot know whether the request landed, so flag it unknown —
-- never re-queue it. Reconcile with Upload-Post ids, then resolve_unknown_publish.
CREATE OR REPLACE FUNCTION public.recover_stale_publishing()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids UUID[];
BEGIN
    WITH f AS (
        UPDATE social_posts SET publish_outcome_unknown = true, locked_by = NULL, locked_until = NULL,
               error_message = 'worker lease expired mid-publish; outcome unknown'
         WHERE status = 'publishing' AND property_content_id IS NOT NULL
           AND NOT publish_outcome_unknown AND locked_until < now()
        RETURNING id)
    SELECT array_agg(id) INTO v_ids FROM f;
    IF v_ids IS NULL THEN RETURN 0; END IF;
    UPDATE publishing_logs SET status = 'unknown', finished_at = now(),
           error_message = 'worker lease expired mid-publish; outcome unknown'
     WHERE social_post_id = ANY (v_ids) AND status = 'started';
    RETURN array_length(v_ids, 1);
END;
$$;

-- Human / reconciler decision for an unknown outcome.
CREATE OR REPLACE FUNCTION public.resolve_unknown_publish(
    p_post UUID, p_outcome TEXT, p_platform_post_id TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sp social_posts%ROWTYPE;
BEGIN
    SELECT * INTO sp FROM social_posts WHERE id = p_post FOR UPDATE;
    IF NOT FOUND OR sp.status <> 'publishing' OR NOT sp.publish_outcome_unknown THEN
        RAISE EXCEPTION 'post % is not an unresolved-outcome post', p_post;
    END IF;
    IF p_outcome = 'published' THEN
        UPDATE social_posts SET status = 'published', published_at = COALESCE(published_at, now()),
               platform_post_id = COALESCE(p_platform_post_id, platform_post_id),
               publish_outcome_unknown = false, error_message = NULL WHERE id = p_post;
    ELSIF p_outcome = 'failed' THEN
        UPDATE social_posts SET status = 'failed', publish_outcome_unknown = false,
               error_message = COALESCE(p_note, 'confirmed not published') WHERE id = p_post;
    ELSE
        RAISE EXCEPTION 'outcome must be published or failed';
    END IF;
    UPDATE publishing_logs
       SET response_metadata = response_metadata || jsonb_build_object('resolved_as', p_outcome, 'note', p_note)
     WHERE social_post_id = p_post AND attempt_number = sp.publish_attempt_count;
    RETURN p_outcome;
END;
$$;

-- Manual / API retry of a FAILED automation post. Runs the same checks as the
-- claim (environment, mode, property, revision, validation, connection) and
-- refuses unresolved-outcome posts. Re-times to now(): a deliberate human retry
-- gets a fresh lateness window. Authenticated editors may call it; it checks
-- membership itself.
CREATE OR REPLACE FUNCTION public.retry_failed_publish(p_post UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sp social_posts%ROWTYPE; v_reason TEXT;
BEGIN
    SELECT * INTO sp FROM social_posts WHERE id = p_post FOR UPDATE;
    IF NOT FOUND OR sp.property_content_id IS NULL THEN RAISE EXCEPTION 'automation post % not found', p_post; END IF;
    IF auth.uid() IS NOT NULL AND NOT (sp.business_id IN (SELECT public.user_business_write_ids())) THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF auth.uid() IS NULL AND current_setting('request.jwt.claim.role', true) IN ('authenticated', 'anon') THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF sp.status <> 'failed' THEN RAISE EXCEPTION 'only failed posts can be retried (status %)', sp.status; END IF;
    IF sp.publish_outcome_unknown THEN RAISE EXCEPTION 'outcome unknown: resolve it before retrying'; END IF;

    UPDATE social_posts
       SET status = 'scheduled', scheduled_at = GREATEST(scheduled_at, now()), next_attempt_at = now(),
           retry_base_attempt = publish_attempt_count, error_message = NULL
     WHERE id = p_post;
    v_reason := public.publish_block_reason(p_post, 'scheduled', false);
    IF v_reason IS NOT NULL THEN
        RAISE EXCEPTION 'cannot retry: %', v_reason USING ERRCODE = 'check_violation';  -- rolls the UPDATE back
    END IF;
    RETURN 'scheduled';
END;
$$;

-- Everything the publishing worker needs about a claimed post in ONE call:
-- the pinned revision's text/media and the connection's metadata.
CREATE OR REPLACE FUNCTION public.get_publish_payload(p_post UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'post_id', sp.id,
        'platform', sp.platform,
        'format', sp.format,
        'revision_id', r.id,
        'caption', COALESCE(sp.caption, r.caption),
        'hashtags', COALESCE(sp.hashtags, r.hashtags, '{}'::text[]),
        'media_type', ma.type::text,
        'media_url', ma.metadata ->> 'publicUrl',
        'connection_id', pcn.id,
        'connection_metadata', pcn.metadata)
      FROM social_posts sp
      JOIN content_revisions r ON r.id = sp.content_revision_id
      LEFT JOIN media_assets ma ON ma.id = r.media_asset_id
      LEFT JOIN platform_connections pcn ON pcn.id = sp.connection_id
     WHERE sp.id = p_post AND sp.property_content_id IS NOT NULL;
$$;

-- Unknown-outcome posts that DO have an Upload-Post id to reconcile against.
-- (Ones without any id can only be resolved by a human.)
CREATE OR REPLACE FUNCTION public.unknown_publish_posts()
RETURNS SETOF social_posts LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM social_posts
     WHERE property_content_id IS NOT NULL AND status = 'publishing' AND publish_outcome_unknown
       AND (upload_post_request_id IS NOT NULL OR upload_post_job_id IS NOT NULL)
     ORDER BY publish_started_at;
$$;

-- ============================================================
-- 20. Gallery regeneration (authenticated editors; authorization inside)
--     Creates a NEW pending revision only. Does not move the current-revision
--     pointer, create posts, or publish anything. Live content that already has
--     posts cannot be regenerated (D3 / spec §11.5).
-- ============================================================

CREATE OR REPLACE FUNCTION public.request_content_regeneration(p_content UUID, p_prompt TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pc property_content%ROWTYPE; v_num INT; v_id UUID;
BEGIN
    SELECT * INTO pc FROM property_content WHERE id = p_content FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'content not found'; END IF;
    IF auth.uid() IS NULL OR NOT (pc.business_id IN (SELECT public.user_business_write_ids())) THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF pc.archived_at IS NOT NULL THEN RAISE EXCEPTION 'archived content cannot be regenerated'; END IF;
    IF pc.generation_status NOT IN ('completed', 'failed') THEN
        RAISE EXCEPTION 'content is still generating';
    END IF;
    IF pc.environment = 'live' AND EXISTS (SELECT 1 FROM social_posts WHERE property_content_id = pc.id) THEN
        RAISE EXCEPTION 'Live content that has publishing records cannot be regenerated';
    END IF;
    IF EXISTS (SELECT 1 FROM content_revisions WHERE property_content_id = pc.id AND validation_status = 'pending') THEN
        RAISE EXCEPTION 'a revision is already being generated';
    END IF;
    SELECT COALESCE(max(revision_number), 0) + 1 INTO v_num FROM content_revisions WHERE property_content_id = pc.id;
    INSERT INTO content_revisions (business_id, property_content_id, revision_number, generation_prompt, created_by)
    VALUES (pc.business_id, pc.id, v_num, p_prompt, auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- ============================================================
-- 21. Privileges
-- ============================================================

DO $$
DECLARE f TEXT;
BEGIN
    -- service-role only
    FOREACH f IN ARRAY ARRAY[
        'release_held_posts(uuid)', 'refresh_cycle_status(uuid)', 'claim_property_for_job(uuid)',
        'ensure_cycle_slots(uuid)', 'claim_generation_jobs(text,int,interval)',
        'generation_job_still_valid(uuid,text)', 'renew_generation_lease(uuid,text,interval)',
        'complete_generation_job(uuid,text)', 'fail_generation_job(uuid,text,text,boolean)',
        'publish_block_reason(uuid,text,boolean)', 'claim_publish_jobs(text,int,interval,uuid)',
        'record_publish_response(uuid,smallint,text,text,jsonb)',
        'finish_publish(uuid,smallint,text,text,boolean,text,jsonb,text)',
        'recover_stale_publishing()', 'resolve_unknown_publish(uuid,text,text,text)',
        'ensure_content_clip(uuid,smallint)', 'get_publish_payload(uuid)', 'unknown_publish_posts()']
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
    END LOOP;
    -- authenticated editors (authorization is inside the function)
    FOREACH f IN ARRAY ARRAY['retry_failed_publish(uuid)', 'request_content_regeneration(uuid,text)']
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
    END LOOP;
END $$;

-- ============================================================
-- 22. RLS
--     * members READ everything for their business
--     * editors+ WRITE only inventory (properties, property_images) and the
--       settings row (mode / is_enabled additionally need owner/admin — trigger)
--     * everything else is written by the service role (bypasses RLS) or via
--       the SECURITY DEFINER functions above
--     * social_posts: users may only write MANUAL rows
-- ============================================================

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'properties', 'property_images', 'property_legacy_content',
        'content_automation_settings', 'content_generation_cycles',
        'content_generation_queue', 'property_promotions', 'property_content',
        'content_revisions', 'content_clips', 'publishing_logs', 'content_performance']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (business_id IN (SELECT public.user_business_ids()))',
            t || '_read', t);
    END LOOP;

    FOREACH t IN ARRAY ARRAY['properties', 'property_images', 'content_automation_settings']
    LOOP
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (business_id IN (SELECT public.user_business_write_ids())) WITH CHECK (business_id IN (SELECT public.user_business_write_ids()))',
            t || '_write', t);
    END LOOP;

    -- Defence in depth: no direct writes at all on the service-written tables.
    FOREACH t IN ARRAY ARRAY[
        'property_legacy_content', 'content_generation_cycles', 'content_generation_queue',
        'property_promotions', 'property_content', 'content_revisions', 'content_clips',
        'publishing_logs', 'content_performance']
    LOOP
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I FROM anon, authenticated', t);
    END LOOP;
    -- anon never touches any of these (RLS would also return nothing).
    FOREACH t IN ARRAY ARRAY[
        'properties', 'property_images', 'property_legacy_content',
        'content_automation_settings', 'content_generation_cycles',
        'content_generation_queue', 'property_promotions', 'property_content',
        'content_revisions', 'content_clips', 'publishing_logs', 'content_performance']
    LOOP
        EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    END LOOP;
    REVOKE ALL ON property_promotion_stats FROM anon;
    REVOKE TRUNCATE ON properties, property_images, content_automation_settings FROM authenticated;
END $$;

-- social_posts: the old policy let any editor write ANY row, including
-- automation rows, straight through PostgREST. Narrow it to manual rows.
DROP POLICY IF EXISTS social_posts_write ON social_posts;
CREATE POLICY social_posts_write_manual ON social_posts FOR ALL TO authenticated
    USING (property_content_id IS NULL AND business_id IN (SELECT public.user_business_write_ids()))
    WITH CHECK (property_content_id IS NULL AND business_id IN (SELECT public.user_business_write_ids()));
