# Kinetix Documentation Overview

Welcome to the **Kinetix** documentation. Kinetix is a single-tenant Marketing Automation Platform, consolidating several previously-separate n8n + Next.js projects built for one client into one codebase, one Postgres schema, and one background-job runner (Inngest replacing n8n). The schema is multi-tenant-shaped (a `businesses` + `business_users` model) but runs with exactly **one** `businesses` row today — there is one client. A second client later needs new rows, not a new schema (see `architecture/system_design.md` §3).

**Built and active today:** Meta Ads, Social Media, Outreach, plus a cross-module Root Dashboard and a Settings page.

1. **Root Dashboard** (`/dashboard`) — a cross-module rollup: combined leads/reach KPIs, an acquisition funnel, per-module trend cards, and a channel comparison table. See `architecture/system_design.md` §5. *(active)*
2. **Meta Ads Automation** (`/meta-ads`) — AI-driven generation, launching, and analysis of Meta (Facebook/Instagram) advertising campaigns. *(active)*
3. **Social Media Management** (`/social`) — Multi-platform (TikTok, LinkedIn, YouTube, Meta, X) content generation, scheduling, and publishing. *(active)*
4. **Outreach & Lead Gen** (`/outreach`) — Apify-based lead scraping into lists, AI-drafted cold email campaigns sent through Instantly.ai, and live delivery analytics. *(active)*
5. **Settings** (`/settings`) — Business identity, brand voice, services, and automation defaults (outreach pacing, Meta Ads defaults, video character reference) — one page, no sub-routes. *(active)*

Every module list page (Campaigns, Reports, Ad Library, Leads in Meta Ads; Posts in Social; Leads, Campaigns in Outreach) is server-side paginated through one shared system — see `architecture/system_design.md` §6.

## Tech Stack
Kinetix is built on a modern serverless stack:
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4, TanStack Query v5
- **Backend & API:** Next.js Server Actions & API Routes
- **Database & Auth:** Supabase (PostgreSQL, Row Level Security, Supabase Auth)
- **Background Jobs:** Inngest (event-driven, replacing the legacy projects' n8n workflows)
- **AI & Media:** OpenAI (scripting/logic), Kie AI (image/video generation), ElevenLabs (voice), AssemblyAI (caption timing), FFmpeg (final assembly)
- **Scraping:** Apify (outreach lead scraping) — analyzed via direct LLM prompting, not a vector database/RAG
- **Outreach delivery:** Instantly.ai (cold email sending, opens/replies/clicks analytics)
- **Social delivery:** Upload-Post (per-platform publishing to Facebook/Instagram/LinkedIn/X/TikTok/YouTube — Kinetix never does OAuth itself, see `modules/social_media.md` §3)

## Directory Structure
To understand the system deeply without scanning source code, refer to the following documentation modules:

### 1. Architecture
- [`architecture/database_schema.md`](architecture/database_schema.md) — Every table and relationship, verified column-by-column against `supabase/migrations/`.
- [`architecture/system_design.md`](architecture/system_design.md) — How Next.js, Supabase, and Inngest communicate securely, how the multi-tenant-shaped schema runs single-tenant today, the Root Dashboard, and the shared pagination/dashboard-skeleton systems every module reuses.

### 2. Core Modules
- [`modules/meta_ads.md`](modules/meta_ads.md) — Ad creative generation, Campaign Launch (real Meta Graph API objects), the Dashboard/Reports/Ad Library/Leads pages, and Instant Form lead capture.
- [`modules/social_media.md`](modules/social_media.md) — AI content generation, per-platform preview, scheduling, and publishing via Upload-Post.
- [`modules/outreach.md`](modules/outreach.md) — Lead lists, scraping, AI campaign drafting, and Instantly.ai sending.
- [`modules/settings.md`](modules/settings.md) — The one Settings page: business identity/voice/services, and every module's automation defaults.

### 3. Design
- [`../DESIGN.md`](../DESIGN.md) — The UI design system: color/spacing/radius tokens, component specs, and rules for building consistent UI. Always loaded into Claude Code's context via `CLAUDE.md`'s `@DESIGN.md` import.

### 4. Reusable Systems
- [`ai-studio/README.md`](ai-studio/README.md) — The chat-based AI image-generation architecture behind Meta Ads' AI Ad Studio, written as a **portable, project-agnostic spec** (not a Kinetix-feature writeup) — the full generation/edit/questions prompts, the design-layer system, and the reasoning behind each decision, so it can be copied into a different project for a different kind of image-generation product.

---
*Note for AI Agents: Read these documentation files to understand the Kinetix project state and design patterns instead of parsing massive codebase folders. If something here contradicts the actual code, trust the code and flag the doc as stale — these are meant to be kept current, not aspirational.*
