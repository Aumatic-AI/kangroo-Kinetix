# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@DESIGN.md

## Commands

```bash
npm run dev              # Start dev server (Next.js 16, App Router, `next dev --webpack`)
npm run build             # Production build
npm run lint               # ESLint — currently reports ~80 pre-existing errors (mostly no-explicit-any); don't add new ones
npx tsc --noEmit          # Typecheck (no dedicated npm script — run this directly after any change; currently clean)
node --test scripts/tests/*.test.mjs   # Unit tests (node:test, pure logic, no network/DB)
```

There is no `npm test` script. The tests in `scripts/tests/` import the real `src/**/*.ts` files through `alias-hooks.mjs` (resolves `@/…`, strips types), so they need Node 22+. `legacy-social-routes.test.mjs` uses module mocks and fails under the plain command above — run it as `node --experimental-test-module-mocks --import ./scripts/tests/alias-register.mjs --test scripts/tests/legacy-social-routes.test.mjs`. When you change logic in `src/services/content-automation/`, `src/modules/listings/lib/`, or `src/config/nav-active.ts`, run the matching test file.

### Scripts

- `scripts/create-admin-user.mjs` — creates/resets the single login (see Auth below).
- `scripts/check-wordpress.mjs` — read-only check that the WordPress credentials sign in and can publish/upload.
- `scripts/inventory-import/` — `normalize.py` turns `docs/content.xlsx` into normalized JSON (report: `docs/inventory-import-report.md`), `check_images.py` checks image URLs, `apply.mjs` upserts into `properties`/`property_images`. `apply.mjs` is a dry run unless given `--apply --business-id <uuid> --expect-project-ref <ref>`.

### Environment variables

Every env var is declared and validated (zod) in `src/config/env.ts` and read via `env` from `@/config` — add a new variable there and to `.env.example`, not as a bare `process.env` read. The set in use: Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), `OPENAI_API_KEY`, `KIE_API_KEY`, `UPLOAD_POST_API_KEY`, `UPLOAD_POST_PROFILE`, `STORAGE_PROVIDER`, `WORDPRESS_URL`/`WORDPRESS_USERNAME`/`WORDPRESS_APP_PASSWORD` (+ optional `WORDPRESS_CATEGORY_ID`), `INNGEST_EVENT_KEY` (+ `INNGEST_SIGNING_KEY`/`INNGEST_DEV`, read by the Inngest SDK), `LOG_LEVEL`, `NEXT_PUBLIC_APP_URL`.

### Supabase (migrations)

```bash
npx supabase db push --linked        # Push a new migration in supabase/migrations/ to the linked project
npx supabase gen types typescript --project-id <YOUR_PROJECT_REF> --schema public > src/types/supabase.ts
```

Never redirect stderr into the types file (`... > src/types/supabase.ts 2>&1`) — a CLI update-notice on stderr gets appended after the generated `} as const` and silently breaks every consumer with cascading `tsc` errors. Regenerate types after every migration and re-run `tsc --noEmit`. See the `supabase-migration` skill for the full step-by-step.

### Background jobs (Inngest)

Inngest dev server runs at `http://localhost:8288` (`INNGEST_DEV=1` in `.env.local` — must be unset/`0` in production, or every background job tries to reach a local server that doesn't exist). A new Inngest function must be added to the `functions` array in `src/services/inngest/functions.ts` or it never registers, even if `createFunction(...)` exists elsewhere. All cron scheduling is Inngest-side (declared on each `src/jobs/*.job.ts` function itself, triggered by Inngest's own scheduler hitting `/api/inngest`) — there is no `vercel.json` `crons` entry or `/api/cron` route; don't add one, an earlier no-op stub of both tripped Vercel Hobby-plan's daily-cron-jobs limit on deploy.

The registered functions in `src/services/inngest/functions.ts` are the only background jobs in the app:
- `socialScheduledPostCheck` (`src/jobs/social-scheduled-post-check.job.ts`, event `social/scheduled-post-created`) — fired once per scheduled Social post, not a recurring poll.
- `generateSocialImage` (`src/services/inngest/social/generate-social-image.ts`, event `social/generate-image`) — the Social module's AI image generation.
- `publishBlogToWordPress` (`src/services/inngest/content/publish-blog.ts`, event `content/blog-publish`) — publishes one **Live** blog to WordPress (see below).
- `src/services/inngest/content/` — content automation (testing phase): `content/process-queue` (claims queue jobs), `content/generate-job` (one creative end to end), `content/regenerate-requested` (gallery regenerate), and `weeklyContentCycle` (cron Fri 18:00 America/Toronto; when enabled it also plans the whole week's posting days/times up front via `planCycleWeek`). **The cron is inert: it only acts for a business whose `content_automation_settings.auto_run_enabled` is true, and `PATCH /api/content/settings` refuses to set that — and refuses `mode: "live"` — during testing.**

Generation starts only from the manual "Generate now" (`POST /api/content/trigger`), which takes a count of 0–3 each for `socialImage`, `socialVideo`, `linkedin` and `blog` (the user picks image vs video; one social creative is shared by TikTok/Instagram/Facebook). Weekly frequencies are separate per type (`social_image_…`/`social_video_…`/`linkedin_…`/`blog_frequency_per_week`, 0–14 each, social image + video together ≤ 14). The `blog` pipeline is `generate-blog.ts`: the AI looks at the listing photos, decides the post's format/angle/structure/images each run, writes it, and generates images from the listing photos.

**Testing content never leaves the gallery.** The one live publishing path is **blogs → WordPress, Live only** (`docs/architecture/content_automation.md` §13): a DB trigger gives every completed Live blog a `blog_publications` row (CHECK `environment = 'live'`), `kickBlogPublication` sends `content/blog-publish`, and the worker uploads the images and creates a published post via `src/services/wordpress/` (application password in `WORDPRESS_URL`/`WORDPRESS_USERNAME`/`WORDPRESS_APP_PASSWORD`; check with `node --env-file=.env.local scripts/check-wordpress.mjs`). Social publishing is still not wired: a Live-only worker exists as library code (`src/services/content-automation/publish.ts`, DB-scheduled via `claim_publish_jobs`, unit-tested) and `POST /api/content/posts/retry-publish` only re-queues via an RPC, but **no Inngest function runs it and nothing creates automation `social_posts` rows**. Don't wire it in without being asked.

**Video generation exists only in content automation** (every video is ONE 30 s Seedance 2.5 clip, 9:16 480p with native narration — `src/services/content-automation/video-spec.ts`; the FFmpeg renderer only brands it: logo overlay, 0.5 s fade to black and a 1 s Kangrooo end card, ≈31 s final — never joins clips). The old Social AI video pipeline (script → ElevenLabs narration → per-scene images → Seedance 1.5 clips → stitch), ElevenLabs, and the Settings video-reference photos were removed — don't reintroduce them without being asked. Social still generates *images* and publishes uploaded video.

**The Meta Ads module was removed entirely** (pages, `/api/meta-ads/*`, its Inngest jobs, the nightly performance sync, the leads sync, the Graph API client, and the `campaigns`/`ad_sets`/`ads`/`meta_ad_creatives`/`studio_*`/`ad_performance_daily`/`leads` tables). The product is now posting automation only — don't reintroduce Meta functionality, `META_*` env vars, or any Meta Graph API call without being explicitly asked. The root/social dashboards call Upload-Post live on every load (`UploadPostService.getProfileAnalytics`/`getTotalImpressions`); there is no analytics-cache cron.

## Documentation map

This file covers cross-cutting conventions only. For anything deeper, read the relevant file in `docs/` rather than re-deriving it from source — they're kept current, not aspirational:
- [`docs/index.md`](docs/index.md) — start here for an overview of the whole system.
- [`docs/architecture/database_schema.md`](docs/architecture/database_schema.md) — every table, column, and relationship, verified against `supabase/migrations/`.
- [`docs/architecture/system_design.md`](docs/architecture/system_design.md) — how Next.js, Supabase, and Inngest fit together, and the single-tenant-on-multi-tenant-schema model.
- [`docs/architecture/content_automation.md`](docs/architecture/content_automation.md) — the content-automation schema (12 new tables), Testing/Live safeguards, rotation algorithm and publishing flow. Migration applied to the linked project.
- [`docs/modules/*.md`](docs/modules/) — one file per product module (Social Media, Listings, Settings), what's actually built.
- [`DESIGN.md`](DESIGN.md) (imported above, always in context) — the UI design system: tokens, component specs, and rules for building consistent UI.

## Architecture

Kinetix is a single-tenant marketing-automation platform for one client (Kangrooo, a Canadian space and venue booking marketplace). It is a Next.js App Router app with several product "modules" (Content Automation, Social Media, Listings, Settings), navigated via ONE single-level sidebar (`src/components/layout/Sidebar.tsx`): flat links grouped under non-clickable section captions, Settings pinned at the bottom. The active link is the most specific href matching the pathname (`src/config/nav-active.ts`). Don't reintroduce nested/two-tier navigation.

**Content Automation (`/content` — Gallery + Automation tabs; testing phase, gallery-only) and Social Media have real functionality built**, plus **Listings** (`/listings`, a single-page module: the property inventory table with a detail drawer) — these, with Settings and the root Dashboard, are the only product modules in the app today.

### Module structure — always follow this split

- `src/app/(app)/<module>/<tab>/page.tsx` — thin file, just renders the real page component. Real logic never lives here.
- `src/modules/<module>/pages/*.tsx` — the actual page components.
- `src/modules/<module>/components/`, `hooks/`, `services/`, `types/` — everything else for that module.
- Nav entries are centralized, not inferred from the filesystem: a new page needs an entry in both `src/config/routes.ts` (`ROUTES`) and `src/config/navigation.ts` (a link in `NAV_SECTIONS`, or `NAV_FOOTER_ITEMS`), or the sidebar link won't exist / will 404. Keep labels unique across the whole sidebar and equal to the page's own title.
- New shared UI components go in `src/components/ui/` — see `DESIGN.md` §7 for the full component inventory and the PascalCase-filename convention for new ones.

### Single-tenant assumption

Page routes are gated by Supabase Auth in `src/proxy.ts` (Next 16's middleware: no session → `/login`), but `/api/*` routes are **not** gated, and almost every API route/service resolves "the business" via `supabase.from("businesses").limit(1).single()` (or the `getFirstBusinessId()` helper in `src/lib/business.ts` — prefer it in new code) rather than deriving `business_id` from a session. This is intentional for the current one-client scope, not a bug to "fix" by adding multi-tenant plumbing unless explicitly asked.

### Auth

Supabase email/password sign-in only (`src/modules/auth`). **There is no public signup** — the page, `signUp()`, and `enable_signup` in `supabase/config.toml` are removed/off (also disable "Allow new users to sign up" in the hosted dashboard). The single login is provisioned with `ADMIN_PASSWORD=... node --env-file=.env.local scripts/create-admin-user.mjs [username]`; a bare username maps to `<username>@kangrooo.com` in `auth.service.ts`. Don't re-add a signup flow unless asked.

### Supabase client conventions

- **API routes**: `createClient()` from `@/lib/supabase/server` (async, cookie/RLS-scoped).
- **Client components/hooks**: `createClient()` from `@/lib/supabase/client` (sync, browser).
- **Inngest jobs**: bypass RLS entirely — instantiate a raw `@supabase/supabase-js` client inline in the job file with `SUPABASE_SERVICE_ROLE_KEY`, not through `@/lib/supabase`.

### Other shared plumbing

- **Upload-Post** (`src/services/upload-post/`, `UploadPostService`) is the only social publishing/analytics backend; social accounts are connected on Upload-Post's own dashboard, Kinetix never does OAuth. Its hosted FFmpeg API (`src/services/ffmpeg/`) is the video renderer.
- **Logging**: `src/services/logger` (pino, level from `LOG_LEVEL`). **Client state**: zustand stores in `src/store/` (user, business); server data goes through TanStack Query hooks in each module's `hooks/`.
- **Pagination / dashboard skeletons**: every list page uses the shared system in `src/lib/pagination.ts` + `src/components/ui/Pagination.tsx`, and dashboards use `src/components/global/DashboardKit.tsx` — see `docs/architecture/system_design.md` §6–7.

### AI orchestration

`aiOrchestrator` in `src/services/ai/orchestrator.ts` is the single entry point for every AI provider — the only 2 actually wired in are OpenAI (`executeTask`, text) and Kie (`createImageTask`/`createSeedanceVideoTask`/`checkTaskStatus`, image and Seedance 2.5 video). Always call through this, never a provider SDK directly from a route or job. All prompt-building logic lives in `src/prompts/<domain>/index.ts` as plain exported functions, one file per domain — never inline long prompt strings in a route.

### Styling — a recurring gotcha

`src/styles/globals.css` mixes Tailwind v4's auto-generated (layered) utilities with hand-written plain (unlayered) utility classes for the custom design tokens (`--color-primary`, `--color-success`, `--color-danger`, `--color-warning`, `--color-border`, `--color-text`/`--color-text-muted`, radius, etc. — see `DESIGN.md` §2/§4 for the full token list). Per the CSS Cascade Layers spec, **unlayered CSS always wins over layered CSS regardless of specificity or source order** — so a Tailwind utility class with no matching hand-written override in `globals.css` can silently lose to a reset rule (e.g. `button/input/select/textarea { padding: 0 }`, `a { color: inherit }`, or Tailwind's own computed `rounded-lg`) and appear to "do nothing" or resolve to an unexpected value. If a Tailwind class visually has no effect, check for a competing unlayered rule in `globals.css` before assuming a typo — this has been the root cause several times. Only use the real token names already defined there; don't invent new CSS variables.
