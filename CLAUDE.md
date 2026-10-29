# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@DESIGN.md

## Commands

```bash
npm run dev              # Start dev server (Next.js 16, App Router)
npm run build             # Production build
npm run lint               # ESLint
npx tsc --noEmit          # Typecheck (no dedicated npm script — run this directly after any change)
```

No test suite exists in this repo yet — don't assume `npm test` works.

### Supabase (migrations)

```bash
npx supabase db push --linked        # Push a new migration in supabase/migrations/ to the linked project
npx supabase gen types typescript --project-id <YOUR_PROJECT_REF> --schema public > src/types/supabase.ts
```

Never redirect stderr into the types file (`... > src/types/supabase.ts 2>&1`) — a CLI update-notice on stderr gets appended after the generated `} as const` and silently breaks every consumer with cascading `tsc` errors. Regenerate types after every migration and re-run `tsc --noEmit`. See the `supabase-migration` skill for the full step-by-step.

### Background jobs (Inngest)

Inngest dev server runs at `http://localhost:8288` (`INNGEST_DEV=1` in `.env.local` — must be unset/`0` in production, or every background job tries to reach a local server that doesn't exist). A new Inngest function must be added to the `functions` array in `src/services/inngest/functions.ts` or it never registers, even if `createFunction(...)` exists elsewhere. All cron scheduling is Inngest-side (declared on each `src/jobs/*.job.ts` function itself, triggered by Inngest's own scheduler hitting `/api/inngest`) — there is no `vercel.json` `crons` entry or `/api/cron` route; don't add one, an earlier no-op stub of both tripped Vercel Hobby-plan's daily-cron-jobs limit on deploy.

`src/jobs/*.job.ts`, registered in `src/services/inngest/functions.ts` — the only 3 background jobs in the app:
- `meta-ads-performance-sync.job.ts` — nightly cron, populates `ad_performance_daily`.
- `social-scheduled-post-check.job.ts` — event-triggered once per scheduled post, not a recurring poll.
- `src/services/inngest/outreach/send-campaign.ts` (event `outreach/send-campaign`) — sends one outreach campaign through Instantly.ai; fired on-demand from the Campaigns list.

**Four other background jobs were deliberately removed — don't reintroduce any of them without being explicitly asked:**
- A weekly self-ad-analysis job and an earlier competitor-analysis job, which fed AI-generated "market intelligence" into ad-generation prompts. Both jobs, the `ad_analysis_reports` table, and every prompt section reading it are gone — ad generation is grounded only in the business's own Settings context and the user's idea/brief now.
- A 5-minute Meta Ads leads-sync cron and a 5-minute social/root-dashboard analytics-cache-refresh cron. Both pages now call their third-party APIs live on every load instead (`LeadsService.syncFromMeta()`; `UploadPostService.getProfileAnalytics`/`getTotalImpressions`) — always-fresh data was judged more valuable than avoiding the real round trip (Meta Graph ~7-8s; Upload-Post ~several seconds). If page-load latency becomes a real problem, restoring a cache job is a decision for whoever's asking to make explicitly.

## Documentation map

This file covers cross-cutting conventions only. For anything deeper, read the relevant file in `docs/` rather than re-deriving it from source — they're kept current, not aspirational:
- [`docs/index.md`](docs/index.md) — start here for an overview of the whole system.
- [`docs/architecture/database_schema.md`](docs/architecture/database_schema.md) — every table, column, and relationship, verified against `supabase/migrations/`.
- [`docs/architecture/system_design.md`](docs/architecture/system_design.md) — how Next.js, Supabase, and Inngest fit together, and the single-tenant-on-multi-tenant-schema model.
- [`docs/modules/*.md`](docs/modules/) — one file per product module (Meta Ads, Social Media, Outreach), what's actually built.
- [`DESIGN.md`](DESIGN.md) (imported above, always in context) — the UI design system: tokens, component specs, and rules for building consistent UI.

## Architecture

Kinetix is a single-tenant marketing-automation platform for one client (Kangrooo, a Canadian space and venue booking marketplace). It is a Next.js App Router app with several product "modules" (Meta Ads, Social Media, Outreach, Settings), navigated via a two-tier sidebar (`PrimarySidebar` = modules, `SecondarySidebar` = per-module tabs) driven by the URL's pathname prefix in `src/app/(app)/layout.tsx`.

**Meta Ads, Social Media, and Outreach have real functionality built** — these are the only three product modules in the app today.

### Module structure — always follow this split

- `src/app/(app)/<module>/<tab>/page.tsx` — thin file, just renders the real page component. Real logic never lives here.
- `src/modules/<module>/pages/*.tsx` — the actual page components.
- `src/modules/<module>/components/`, `hooks/`, `services/`, `types/` — everything else for that module.
- Nav entries are centralized, not inferred from the filesystem: a new page needs an entry in both `src/config/routes.ts` (`ROUTES`) and `src/config/navigation.ts` (`SECONDARY_NAV_ITEMS`), or the sidebar link won't exist / will 404.
- New shared UI components go in `src/components/ui/` — see `DESIGN.md` §7 for the full component inventory and the PascalCase-filename convention for new ones.

### Single-tenant assumption

There is no per-user auth gating (no `middleware.ts`) and almost every API route/service resolves "the business" via `supabase.from("businesses").limit(1).single()` rather than deriving `business_id` from a session. This is intentional for the current one-client scope, not a bug to "fix" by adding multi-tenant plumbing unless explicitly asked.

### Supabase client conventions

- **API routes**: `createClient()` from `@/lib/supabase/server` (async, cookie/RLS-scoped).
- **Client components/hooks**: `createClient()` from `@/lib/supabase/client` (sync, browser).
- **Inngest jobs**: bypass RLS entirely — instantiate a raw `@supabase/supabase-js` client inline in the job file with `SUPABASE_SERVICE_ROLE_KEY`, not through `@/lib/supabase`.

### AI orchestration

`aiOrchestrator` in `src/services/ai/orchestrator.ts` is the single entry point for every AI provider — the only 4 actually wired in are OpenAI/Gemini (`executeTask`, text), Kie (`createImageTask`/`createVideoTask`/`checkTaskStatus`, image/video), and ElevenLabs (`generateSpeech`, voice). Always call through this, never a provider SDK directly from a route or job. All prompt-building logic lives in `src/prompts/<domain>/index.ts` as plain exported functions, one file per domain — never inline long prompt strings in a route.

### Meta Ads module — credentials and data model

Two separate Meta credentials, both declared in `src/config/env.ts`'s zod schema (optional there, since they're server-only) and read via the parsed `env` object, not `process.env` directly:
- `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` — ad-account scope, covers Campaigns/Reports/Ad Library.
- `META_PAGE_ID` + `META_PAGE_TOKEN` — Page scope, only for Leads (Instant Forms).

`src/services/meta/graph-client.ts` is the one shared Graph API client (`graphGet`/`graphGetAllPages`/`graphPost`/`graphPostForm`/`graphDelete` + `metaErrorMessage()`) — every Meta call should go through it rather than a fresh `fetch()`.

The `campaigns`/`ad_sets`/`ads`/`leads` tables are a **pointer, not a mirror**: they store our own config plus an `external_*_id` pointing at the real Meta object. Current status/spend is always fetched live from the Graph API (short TanStack Query cache), never persisted — only `ad_performance_daily` (nightly snapshot job) and `leads` are meant to be durably stored. New Campaigns/Ad Sets/Ads are always created `PAUSED` on Meta; going live is a separate explicit action (Smart Run / Resume).

**Leads has no webhook — `GET /api/meta-ads/leads` calls Meta live on every request instead** (see Background jobs above for why). It calls `LeadsService.syncFromMeta()` (upserts on `meta_lead_id`, never deletes) before reading `leads`, so any lead from an earlier sync stays in the table even if a later Graph API response omits it — reading right after syncing already reflects both sources, not just the latest call. If the live sync fails, the route degrades to whatever's already in `leads` rather than failing the page. "Sync now" (`POST /api/meta-ads/leads/sync`, same underlying service) forces another sync without leaving/reloading the page. No `META_APP_SECRET`/`META_WEBHOOK_VERIFY_TOKEN`/HMAC verification/dashboard subscription needed either way.

### Outreach module — Instantly.ai and the unified status system

Every Kinetix outreach campaign gets its **own dedicated Instantly.ai campaign** — never share one Instantly campaign across multiple Kinetix campaigns (a legacy bug this deliberately avoids). `src/services/instantly/client.ts` is the one Instantly API wrapper (`InstantlyService`); campaigns are created in Draft and must be explicitly activated.

Same **pointer, not mirror** split as Meta Ads: our DB (`outreach_campaigns`, `outreach_leads`, `outreach_lead_lists`, `outreach_campaign_leads`) owns config and workflow state; Instantly owns live delivery/analytics, always fetched fresh via `/api/outreach/analytics`, never cached in our DB.

**Never branch UI on `outreach_campaigns.status` or Instantly's raw numeric status directly** — always go through `resolveCampaignStatus()` in `src/modules/outreach/utils/campaign-status.ts`, the single merge point producing one of six values (`draft`, `ready`, `sending`, `sent`, `paused`, `no_recipients`). See `docs/modules/outreach.md` for what each means and drives it.

### Styling — a recurring gotcha

`src/styles/globals.css` mixes Tailwind v4's auto-generated (layered) utilities with hand-written plain (unlayered) utility classes for the custom design tokens (`--color-primary`, `--color-success`, `--color-danger`, `--color-warning`, `--color-border`, `--color-text`/`--color-text-muted`, radius, etc. — see `DESIGN.md` §2/§4 for the full token list). Per the CSS Cascade Layers spec, **unlayered CSS always wins over layered CSS regardless of specificity or source order** — so a Tailwind utility class with no matching hand-written override in `globals.css` can silently lose to a reset rule (e.g. `button/input/select/textarea { padding: 0 }`, `a { color: inherit }`, or Tailwind's own computed `rounded-lg`) and appear to "do nothing" or resolve to an unexpected value. If a Tailwind class visually has no effect, check for a competing unlayered rule in `globals.css` before assuming a typo — this has been the root cause several times. Only use the real token names already defined there; don't invent new CSS variables.
