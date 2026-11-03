# Kangrooo proposed data model

**Status: migration written and validated locally (`supabase/migrations/20261031000000_content_automation_schema.sql`) · NOT applied to any Supabase project.** The authoritative description is now [`architecture/content_automation.md`](architecture/content_automation.md); this file is the original review and keeps its history. Where they differ, the architecture doc wins.

## Reconciled table list (12 new tables)

`properties` · `property_images` · `property_legacy_content` · `content_automation_settings` · `content_generation_cycles` · `content_generation_queue` · `property_promotions` · `property_content` · `content_revisions` · **`content_clips`** · `publishing_logs` · `content_performance`

`social_posts` is an **existing** table that is **modified** (not counted). No `content_schedule` table. The earlier export of this document listed only 11 of the 12 — `content_clips` (per-clip state for two-part videos) was missing.

Decisions applied: environment named `environment` on every immutable record (`automation_mode` stays on the settings row as the *currently selected* mode); Testing content never creates a `social_posts` row; 6-hour maximum lateness then `skipped`; only owners/admins switch mode; frequency 0–14; shared rotation history with per-pipeline fairness; unchecked images eligible; Live→Testing holds pending Live posts; `America/Toronto` is a configurable fallback only.

---

## Original review (kept for history)

Proposed · (at the time) not implemented · no migrations created

## Architecture review: content automation on top of Kinetix Main

Kangrooo generates and publishes promotional content for a business’s property and venue inventory. The proposed model adds 12 tables, extends `social_posts` as the canonical publishing record, reuses seven Kinetix tables, leaves Meta Ads untouched and proposes removing Outreach. Nothing here has been migrated.

#### Social pipeline Proposed

TikTok, Instagram, Facebook

- One shared creative, image or video
- One `social_posts` row per platform
- Captions, hashtags and metadata may differ per platform
- One shared weekly frequency

#### LinkedIn pipeline Proposed

Separate AI content strategy

- Text and image only (`text_image`)
- No video path
- Professional, business-oriented tone
- Its own weekly frequency

### What the user configures

Two weekly frequencies and the environment. AI chooses the property, format, script, caption and timing. The coming week is generated in advance and shown in the gallery. A frequency of zero disables that pipeline.

#### Status labels used throughout

ExistingVerified in the current Kinetix codebase.

ModifiedExisting table proposed for extension.

ProposedNew table or relationship in the proposed design.

Under reviewUnresolved design decision.

Not implementedMigration and application changes not yet made. Applies to every proposed and modified item.

Field types are shown only where the brief establishes them (JSONB, arrays). Anything else is marked unspecified.

### Design principles

#### Reuse the publishing record

`social_posts` stays the one place a platform post lives. No separate `content_schedule` table.

#### Environment is data, not a flag

Testing and Live are recorded on cycles, promotions, content and posts. Content environment is immutable; Testing content can never be published.

#### Creative, then revisions

`property_content` is the creative; `content_revisions` holds every version; the current one is a pointer.

#### Claimed is not promoted

Rotation history must distinguish a selected property from a successfully generated one. Failed jobs do not count.

#### Safe, repeatable jobs

Idempotency keys, database locks with expiry, bounded retries, and no blind retry when the Upload-Post outcome is unknown.

#### History is read-only

Imported spreadsheet content sits in its own table with no path into publishing.

### Inventory import context

| Item | Finding |
| --- | --- |
| Source rows | About 332 |
| Junk rows identified | 2 |
| Property rows proposed for import | 330 |
| Duplicated titles | 2 titles, different properties; kept separate via `source_key` |
| Images | Up to 5 URLs per property → `property_images` |
| `space_category` | One label per property |
| `event_types` | Slash-separated; parsed to an array, raw string kept in `event_types_raw` |
| Location | City name only; region, country and timezone not consistently verified |
| Video use count / last used | Empty in source |
| Historical blog, image, video data | Limited → `property_legacy_content` |

#### Location verification Under review

The previous investigation reported the number of non-Ontario or ambiguous city values inconsistently. No definitive count is shown here. Ambiguous cities need verification before a timezone is assigned; unknown region, country or timezone values stay empty rather than guessed, with `location_verified` recording the outcome.

#### Not imported or invented

Addresses, pricing, capacities, amenities and descriptions are not in the source and are not part of the proposed import.

## Entity relationship diagram

Tables are grouped by domain. Select a table to trace its relationships; drag to pan, scroll or use the buttons to zoom. Key fields only. Child-side lines attach to the foreign-key field.

#### Legend

Existing, reused unchanged

Modified (existing, extended)

Proposed new table

Relationship listed in the model

Implied by a listed FK field

Selected table’s relationships

Ends read parent → child: **1** on the referenced side, **N** on the referencing side. **N\*** means uniqueness (1:1 vs 1:N) is not established. amber fields on `social_posts` are proposed additions. Relationships among existing tables are not redrawn.

#### No table selected

Select a table in the diagram to see its relationships here.

## Table explorer

Search table and field names. Select a table to see its purpose, keys, relationships and constraints.

## Automation flow

From the weekly scheduler to performance collection. Table names are links to the explorer.

## Property rotation

Each business rotates through its own inventory. Testing and Live keep independent promotion histories in `property_promotions`, and a claimed property only counts once its content is successfully generated.

#### Rotation simulator Illustrative

P-01… are placeholders, not real inventory. Selection here uses a sequential cursor over `rotation_seq`; the exact algorithm is not fixed in the model (see Open decisions).

#### Ledger

| # | Claimed | Outcome |
| --- | --- | --- |

Failed rows are shown to make the distinction visible; how the model records them is undecided.

#### Rotation rules

- Eligible: `status = active` and at least one usable image.
- Selection is fair and sequential within a business.
- New properties are appended (`rotation_seq`) without resetting the cycle.
- Deactivated properties are skipped, not removed from history.
- Reactivated properties re-enter based on their previous history.
- Testing and Live histories never mix.
- A failed generation is not a successful promotion.

## Testing vs Live

Two strictly isolated environments. Switching a business to Live never makes existing Testing content publishable.

#### Testing default for new businesses (provisional)

- Generates content automatically into the private gallery
- Never publishes to connected accounts
- User can inspect and regenerate (new revision)
- Own generation cycles and own rotation history

gallery_only

#### Live

- Generates, schedules and publishes automatically
- No per-post approval
- Rechecks mode, automation status, property, revision and connection before publishing
- Own generation cycles and own rotation history

scheduledheldpublishingpublishedfailedcancelledskipped

**Hard boundary.** Content environment is immutable after creation. Backend and database constraints must reject any Testing record entering a publishing state, and a Testing record must never transition into a Live publishing record. Legacy statuses review and approved may remain on `social_posts` for backward compatibility but are not used by automation.

### Where environment is recorded

| Table | Field | Role |
| --- | --- | --- |
| content_automation_settings | automation_mode | Business’s current mode (testing \| live); change tracked by `mode_changed_at` / `mode_changed_by` |
| content_generation_cycles | environment | Testing and Live cycles may exist for the same week independently |
| content_generation_queue | via `cycle_id` | No own environment field listed; inherits from its cycle |
| property_promotions | environment | Separates rotation histories |
| property_content | environment | Immutable after creation |
| social_posts | environment_mode | Required on automation posts; only Live may enter publishing states |

Field naming differs between tables (`environment`, `environment_mode`, `automation_mode`). Raised as an open issue rather than normalised here.

### Database safeguards

## Existing vs new

What the proposal keeps, extends, adds and removes. Removal is subject to dependency checks.

### Additions to `social_posts`

## Open decisions and issues

Items needing approval before implementation. Nothing here has been silently decided.