# System Design & Architecture

Kinetix follows a modern, serverless, event-driven architecture designed to handle long-running AI tasks without blocking the main web threads or running into serverless timeout limits.

**Tenancy:** the schema is multi-tenant-shaped (`businesses` + `business_users`), but Kinetix runs with exactly **one** `businesses` row today — there is one client. This is a deliberate choice: it costs nothing to operate single-tenant, and a second client later needs zero schema changes, just new rows. See §3.

## 1. High-Level Communication Flow

```mermaid
graph TD
    Client["Next.js Client (Browser)"] -- "Read Data (Realtime)" --> Supabase["Supabase (PostgreSQL)"]
    Client -- "Trigger Actions" --> API["Next.js Server Actions / API Routes"]
    API -- "Dispatch Events" --> Inngest["Inngest Event Broker"]
    Inngest -- "Execute Job Steps" --> Jobs["Inngest Workers (Next.js API)"]
    Jobs -- "Read/Write" --> Supabase
    Jobs -- "HTTP APIs" --> AI["OpenAI / Kie AI / ElevenLabs / AssemblyAI / Apify"]
    Jobs -- "Publish" --> Meta["Meta Graph API / Social Platforms"]
    Jobs -- "Send" --> Instantly["Instantly.ai (Outreach email delivery)"]
```

## 2. Component Responsibilities

### A. Next.js Frontend (App Router)
- **Responsibility:** UI rendering, routing, optimistic UI updates.
- **Data Fetching:** Direct database queries via `@supabase/ssr` (bypassing custom API routes), protected by Row Level Security (RLS). This enables fast reads and realtime subscription capabilities.

### B. Next.js Backend (Server Actions / API Routes)
- **Responsibility:** Secure operations only.
- **Usage:** Used *only* for things the client cannot do securely — chiefly, dispatching background events to Inngest (`inngest.send()`, e.g. `meta-ads/generate-image`, `outreach/scrape-contacts`) and calling third-party APIs with server-only secrets (Meta Graph, Instantly, Upload-Post) that a browser could never hold safely.
- **No inbound webhooks and no OAuth callbacks today.** Meta Ads' Leads previously used a real-time Lead Ads webhook; it was removed in favor of a scheduled background sync instead (see §2.D below and `modules/meta_ads.md`). Social Media never does OAuth itself — accounts are connected on Upload-Post's own dashboard (see `modules/social_media.md` §3). If either is ever added back, it belongs in this layer.

### C. Supabase (Database & Auth)
- **Auth:** Supabase Auth only. RLS's `auth.uid()` requires Supabase-issued JWTs — there is no separate NextAuth session layer in this app.
- **Database:** PostgreSQL. Every piece of client data belongs to a `business`, not directly to a `user` — see §3. Users join a business via the `business_users` junction table.
- **Security:** RLS policies ensure a user can only read/write rows where a `business_users` row links their `auth.uid()` to that row's `business_id`. With one business today, every user simply has one `business_users` row (auto-created — see §3) — functionally equivalent to a simpler model, but the isolation is real and already enforced, not bolted on later.
- **Vault:** Supabase Vault stores provider secrets (OpenAI, Apify, ElevenLabs, Kie, AssemblyAI) and OAuth tokens (Meta, TikTok, LinkedIn, YouTube, X) by reference — `secret_vault_ref` / `access_token_vault_ref` columns point at a Vault entry; the raw secret never sits in a Postgres column.

### D. Inngest (Background Job Engine)
- **Responsibility:** Managing long-running, error-prone tasks.
- **Why Inngest?** AI video generation (Kie AI) can take up to 3–5 minutes. Vercel serverless functions time out after 10–60 seconds. Inngest's step functions (`step.run`, `step.sleep`) pause execution, wait for the external job to finish, and resume — without holding a Vercel function open or hitting the timeout.
- **Canonical jobs.** The authoritative list is whatever's actually in the `functions` array exported from `src/services/inngest/functions.ts` — a function not in that array never registers, even if `createFunction(...)` exists elsewhere in the codebase. This table is that array, verified, not an idealized/proposed list:

| Job | Trigger | Event name / cron |
|---|---|---|
| Meta Ads performance sync (writes `ad_performance_daily`) | cron, daily | `0 4 * * *` |
| Meta ad creative generation (image) | event | `meta-ads/generate-image` |
| Meta ad creative generation (video) | event | `meta-ads/generate-video` |
| AI Ad Studio image generation | event | `meta-ads/generate-studio-image` |
| AI Ad Studio image edit | event | `meta-ads/edit-studio-image` |
| Social post generation (image) | event | `social/generate-image` |
| Social post generation (video) | event | `social/generate-video` |
| Scheduled social post publish | event, one instance per scheduled post — not a recurring poll | `social/scheduled-post-created` |
| Outreach lead scraping | event (triggered from Find Leads) | `outreach/scrape-contacts` |
| Outreach campaign send | event (triggered from the Campaigns list, not a cron) | `outreach/send-campaign` |

Only 2 of these are real crons (Meta Ads performance sync, daily) — everything else is either event-triggered on demand or (the scheduled social post publish) fired once per instance, never a recurring poll. Two previously-listed jobs no longer exist at all: a weekly self-ad-performance-analysis job (hourly cron checking a per-business Settings schedule via `shouldRunScheduledJob()`) was removed along with the "market intelligence"/"winning angle" it fed into ad-generation prompts, as an unused feature — see `database_schema.md` §5 and `modules/meta_ads.md` §1. A social/root dashboard analytics cache refresh and a Meta Ads leads sync (both every 5 minutes) were removed earlier still — see the Leads/dashboards note directly below.

Every event payload carries `business_id` explicitly. Inngest functions run with the Supabase service-role key, which bypasses RLS entirely — scoping for background writes comes from the payload, never inferred from a session (there is no user session inside a background worker).

The Outreach scrape job (`scrapeOutreachContacts`) reports its progress purely through `outreach_scrape_jobs.status` — earlier versions pushed realtime Supabase broadcasts to a global "jobs" widget on top of that, but a broadcast is a single unpersisted message with no replay: any WebSocket hiccup during the job's several-minute run silently and permanently lost the terminal "done" message, stranding the UI. That widget (and the whole global job-tracking store behind it) was removed — the Leads page now polls `outreach_scrape_jobs` directly (`useScrapeJobs`, see `modules/outreach.md`), the same page-scoped-polling pattern already used for Meta Ads/Social Media AI generation (`generationRefetchInterval` — see `modules/meta_ads.md` / `modules/social_media.md`). No global widget, no broadcast channel, one consistent pattern for every "something's generating/running in the background" case in the app.

### Leads and the dashboards call their slow third-party APIs live, on every page load — by deliberate choice

This used to go the other way: the Meta Ads Leads page and the Root/Social dashboards both had a background-cache pattern — a scheduled Inngest job (every 5 minutes) was the only thing that ever called the slow external API (Meta Graph for Leads, Upload-Post analytics for the dashboards), writing the result into our own table (`leads`; `upload_post_analytics_cache` — see `database_schema.md` §2), and the page's own GET route only ever read that table.

Both background jobs (`meta-ads-leads-sync.job.ts`, `social-analytics-cache-refresh.job.ts`) were removed on purpose — always-fresh data was judged more valuable than avoiding the real, measured round trip (Meta Graph ~7-8s for Leads, Upload-Post analytics ~several seconds for the dashboards). `GET /api/meta-ads/leads` now calls `LeadsService.syncFromMeta()` before reading `leads` on every request; the Root/Social dashboard routes call `UploadPostService.getProfileAnalytics`/`getTotalImpressions` directly, no cache table involved. `syncFromMeta()` only ever upserts (never deletes), so a lead from an earlier sync stays in `leads` even if a later Graph API response happens to omit it — reading the table right after syncing already reflects both sources, not just the latest call. Both routes degrade to whatever they already have if the live call itself fails, rather than failing the whole page.

`upload_post_analytics_cache` still exists as a table (nothing currently reads or writes it) — left alone rather than dropped, since no one asked for it to be removed. That's not a universal rule, though: when a later cleanup explicitly asked to remove the (separate, unrelated) self-ad-analysis/competitor-analysis feature, `ad_analysis_reports` and its `businesses` schedule columns were actually dropped, not just orphaned — see `database_schema.md` §5. Whether to drop or just leave a removed feature's schema behind depends on what was actually asked for, not a fixed house style.

Don't reintroduce a background sync job for either of these without being asked — if page-load latency becomes a real problem again, restoring the cache pattern is a decision for whoever's asking to make explicitly. The underlying principle (a slow third-party API shouldn't block a passive page load by default) is still worth applying to any *new* integration; these two are documented, deliberate exceptions, not evidence the principle was wrong.

## 3. Tenancy Model

The schema is multi-tenant-shaped: every table hangs off `business_id`, and a `business_users` junction table links `auth.uid()` to the business(es) a user belongs to. Kinetix runs with **exactly one** `businesses` row today.

Running multi-tenant-shaped schema single-tenant costs nothing functionally — the one thing it requires is that every user actually gets enrolled in `business_users`, or RLS (§8 in `database_schema.md`) will correctly, but unhelpfully, show them nothing. That's closed with a trigger, mirroring the existing `on_auth_user_created` pattern that already auto-creates a `profiles` row:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user_business_membership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.business_users (business_id, user_id, role)
    SELECT id, NEW.id, 'admin' FROM public.businesses LIMIT 1
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END; $$;

CREATE TRIGGER on_profile_created_join_business
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_business_membership();
```

With this in place, onboarding a new team member needs no manual "add to business" step — they're enrolled automatically the moment their profile is created, same as today. Whenever a second `businesses` row is genuinely needed, this trigger's `LIMIT 1` is the one place that stops being correct — replace the auto-enroll with a real invite flow at that point. Nothing else in the schema changes.

One code-level follow-up for whenever the migration actually happens (not part of this doc pass): `src/services/auth/session.ts` and `permissions.ts` currently read `role` off `profiles.role` directly. With `business_users` as the membership table, role moves to the membership row (`business_users.role`) — a small but real code change, since a user's role is now scoped per-business-membership rather than global to their profile.

## 4. Intelligence: no RAG, no vector DB

Every AI-facing feature in Kinetix (ad script/visual-prompt generation, outreach email drafting, social captions) works by direct context-window prompting: the relevant business context is assembled into a single prompt and sent to OpenAI in one call. Kinetix does not use Pinecone or any vector store anywhere. The legacy n8n pipeline used a Pinecone-backed RAG step for its competitor-analysis feature; that was deliberately not carried forward when this app was rebuilt, and the feature itself (competitor analysis, plus a related self-ad-analysis job) was later removed from Kinetix entirely as unused — see `database_schema.md` §5. The RAG-vs-single-prompt reasoning still holds for anything AI-facing this app does today: the data volumes involved are small enough (a business's own services/context, a handful of leads, one idea prompt) that retrieval isn't needed, and a single well-scoped prompt is simpler to build, debug, and reason about.

## 5. Root Dashboard — cross-module rollup

`/dashboard` (`src/modules/dashboard/`) is the app's landing page — `/` itself is a hard redirect to it (`src/app/page.tsx`), it isn't served at `/` directly. It's the only page that reads across all three product modules in one request, backed by a single `GET /api/dashboard?range=` handler that aggregates:

- **Meta Ads:** active campaign count, `ad_performance_daily` spend/impressions/clicks for the selected range, `leads` table count.
- **Outreach:** `OutreachCampaignsService.getCampaignsWithAnalytics()` (the same merge Outreach's own Dashboard and Campaigns page use), plus DB-only aggregates from `outreach_campaign_leads`/`outreach_leads`.
- **Social:** `platform_connections` status, plus Upload-Post profile analytics/impressions called live on every request (see §2's note on Leads/dashboards calling their APIs live) — best-effort beyond that (a failed call degrades gracefully rather than failing the whole dashboard).

Only two KPIs are genuine cross-module sums — **Total Leads** (Meta inbound + Outreach added) and **Total Reach** (Meta + Social impressions) — because those are the only concepts that are genuinely the same thing across modules. Everything else (spend, reply rate, followers) stays scoped to its own module; Outreach's "leads" (cold-scraped prospects) are never silently merged with Meta's "leads" (inbound Instant Form conversions) beyond that one explicitly-labeled combined KPI.

The page itself: a range switcher (7d/14d/30d/90d/All — `range=all` is a capped 180-day window, not a true earliest-row lookup), a KPI row, an acquisition funnel (Reach → Clicks → Leads), two trend charts (Leads by source, Reach by channel), three per-module trend cards linking out to that module's own Dashboard, and a channel comparison table. Current-state numbers (active campaigns, "sending now," followers) are live snapshots that don't rescope with the selected range — only the trend/summary numbers do.

## 6. Shared Pagination System

Every list page across all three modules (Meta Ads: Campaigns, Reports, Ad Library, Leads; Social: Posts; Outreach: Leads, Campaigns) uses one shared pagination contract instead of each inventing its own:

- **`src/lib/pagination.ts`** — the only two allowed page sizes, `PAGE_SIZE_COMPACT` (10, for tables and low-density grids) and `PAGE_SIZE_DENSE` (20, for denser card/thumbnail grids) — picked per page based on roughly how many items its layout shows per viewport, never a bespoke number. Plus three helpers: `paginationMeta(total, page, limit)` (returns `{ total, page, limit, totalPages }`, floored at 1 page), `rangeFor(page, limit)` (the `[from, to]` tuple for Supabase's `.range()`), and `paginateArray(items, page, limit)` (in-memory slicing for the one list that can't be paginated at the query level — see below).
- **`src/components/ui/Pagination.tsx`** — the one Prev/1…N…Last/Next control every paginated page renders, with page-number condensation (always page 1 and the last page, plus current±1, collapsing any gap into a single "…").
- **API contract:** every paginated route reads `page`/`limit` query params and returns its data array plus the spread of `paginationMeta(...)` alongside it (e.g. `{ campaigns, total, page, limit, totalPages }`) — the array key name stays domain-specific (`campaigns`, `leads`, `ads`, `lists`) rather than a generic `items`, for readability at each call site.
- **Client hooks** use TanStack Query's `keepPreviousData` so switching pages doesn't flash a loading skeleton — the previous page's rows stay visible until the next page resolves.

**The one exception — Social Posts is paginated in-memory, not at the query level.** A `social_posts` row exists per *platform a post targets*, not per logical post — one post published to 3 platforms is 3 rows, tied together only by a shared `media_asset_id` (or, for text posts with no media, a `created_at`+`idea_prompt` coincidence — see `modules/social_media.md` §8). Slicing raw rows with `.range()` could split one post's rows across two pages. So `Posts.tsx` fetches all rows (still a lightweight query), groups them client-side into `PostGroup[]` (existing logic, unchanged), then applies `paginateArray()` to the *grouped* list before rendering. This is the one page in the system that doesn't reduce its initial fetch size via pagination — a real, currently-accepted trade-off. Fixing it at the query level would need a schema change (a real `post_group_id` stamped at creation time for both image/video and text posts), which is a worthwhile follow-up but out of scope for the pagination pass that added this system.

Some hooks that back a *picker* rather than a *list page* deliberately stay unpaginated even though a paginated sibling exists for the same data — e.g. `useLeadLists()` (full list, for `FindLeadsModal`/`NewCampaignPage`'s dropdowns) alongside `usePaginatedLeadLists()` (for the Leads page's table). Both hit the same API route, which branches on whether `page`/`limit` are present in the query string at all.

## 7. Shared Dashboard UI Kit

`src/components/global/DashboardKit.tsx` is the one file the Root Dashboard and all three module dashboards (Meta Ads, Outreach, Social) are built from, so the four read as one product instead of four one-off designs. It exports:
- A fixed color system (`ACCENT` — purple/blue/green/amber/red, mapped to `DESIGN.md`'s tokens) and `CHART_SERIES`, a categorical color order that's never re-picked per chart (per the dataviz convention: color follows the entity, not its rank).
- `chartTickInterval(pointCount, targetLabels = 7)` — scales a chart's x-axis label interval to the actual number of data points, so labels never overlap regardless of how long a selected date range is (replacing an earlier fixed-threshold approach that broke down for very long ranges).
- Layout primitives: `Card`, `SectionTitle`, `KpiTile` (compact/tint/default variants), `EmptyState`.
- A matching family of loading skeletons — `KpiRowSkeleton`, `AreaChartSkeleton`, `PieChartSkeleton`, `BarRowsSkeleton`, `ProportionalListSkeleton`, `TableSkeleton`, `ModuleCardSkeleton`, and more — each built on the real `Skeleton` primitive (`src/components/ui/skeleton.tsx`) and shaped to mirror its corresponding real component's exact layout, so nothing visibly reflows once real data arrives. The same principle extends beyond dashboards: every list/detail page in the app (including the three Meta Ads detail pages, Ad Library, and Outreach's Campaign Detail) follows the same rule — real static chrome (headers, breadcrumbs, known labels) renders immediately, and only the genuinely data-dependent parts shimmer.
