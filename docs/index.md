# Kinetix Documentation Overview

Welcome to the **Kinetix** documentation. Kinetix is a single-tenant Marketing Automation Platform, consolidating several previously-separate n8n + Next.js projects built for one client into one codebase, one Postgres schema, and one background-job runner (Inngest replacing n8n). The schema is multi-tenant-shaped (a `businesses` + `business_users` model) but runs with exactly **one** `businesses` row today — there is one client. A second client later needs new rows, not a new schema (see `architecture/system_design.md` §3).

**Built and active today:** Social Media, Listings (the property inventory), Content Automation (testing phase), plus a cross-module Root Dashboard and a Settings page.

1. **Root Dashboard** (`/dashboard`) — a Social rollup: total reach, followers and engagement KPIs, a reach trend and a Social module card (all live from Upload-Post). *(active)*
2. ~~Meta Ads Automation~~ and ~~Outreach~~ — **removed** (the product is posting automation only; see `architecture/database_schema.md` §3–6, §8 and §11).
3. **Social Media Management** (`/social`) — Multi-platform (TikTok, LinkedIn, YouTube, Facebook, Instagram, X) content generation, scheduling, and publishing. *(active)*
4. **Content Automation** (`/content` Gallery, `/content/automation` Automation): AI-generated property content (an image or a narrated 30 s video for TikTok·Instagram·Facebook, text + image for LinkedIn, and display-only blog posts) with AI-proposed posting times, reviewed in a gallery. *Testing phase: started manually with "Generate now", never published.* See `architecture/content_automation.md`. Product requirements: [`kangrooo-content-automation-spec.md`](kangrooo-content-automation-spec.md), with an implementation-status section at the top.
5. **Listings** (`/listings`): the property inventory the content automation rotates through. *(active)*
6. **Settings** (`/settings`): business identity, brand voice, services and a usage estimate. One page, no sub-routes. *(active)*

Every list page (Social Posts, Listings, the Content Gallery) uses one shared pagination system; see `architecture/system_design.md` §6.

## Tech Stack
Kinetix is built on a modern serverless stack:
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4, TanStack Query v5
- **Backend & API:** Next.js Server Actions & API Routes
- **Database & Auth:** Supabase (PostgreSQL, Row Level Security, Supabase Auth)
- **Background Jobs:** Inngest (event-driven, replacing the legacy projects' n8n workflows)
- **AI & Media:** OpenAI (planning, review, copy, vision checks), Kie AI (image generation and Seedance 2.5 video with native narration), FFmpeg on the Upload-Post renderer (logo overlay, fade-out, end card, faststart), sharp (logo stamp on generated images)
- **Social delivery:** Upload-Post (per-platform publishing to Facebook/Instagram/LinkedIn/X/TikTok/YouTube — Kinetix never does OAuth itself, see `modules/social_media.md` §3)

## Directory Structure
To understand the system deeply without scanning source code, refer to the following documentation modules:

### 1. Architecture
- [`architecture/database_schema.md`](architecture/database_schema.md) — Every table and relationship, verified column-by-column against `supabase/migrations/`.
- [`architecture/content_automation.md`](architecture/content_automation.md) — Kangrooo content automation: the 12 new tables, Testing-vs-Live safeguards, the property rotation algorithm, publishing flow, RLS matrix, the generation pipeline and what's not built. *(migrations applied)*
- [`architecture/system_design.md`](architecture/system_design.md) — How Next.js, Supabase, and Inngest communicate securely, how the multi-tenant-shaped schema runs single-tenant today, the Root Dashboard, and the shared pagination/dashboard-skeleton systems every module reuses.

### 2. Core Modules
- [`modules/listings.md`](modules/listings.md) — The property inventory (`/listings`): searchable table, image/detail drawer, rotation status and activate/deactivate.
- [`modules/social_media.md`](modules/social_media.md) — AI content generation, per-platform preview, scheduling, and publishing via Upload-Post.
- [`modules/settings.md`](modules/settings.md): the one Settings page (business identity, voice, services, usage estimate).

### Other reference
- [`kangrooo-content-automation-spec.md`](kangrooo-content-automation-spec.md): the product requirements, with an implementation-status section.
- [`prodo-creative-knowledge.md`](prodo-creative-knowledge.md): creative-strategy source material the content-automation strategy layer was adapted from.
- [`inventory-import-report.md`](inventory-import-report.md): report from the property inventory import.
- [`Proposed-data-model.md`](Proposed-data-model.md): the pre-migration proposal, kept for history. The applied schema is in `architecture/content_automation.md`.

### 3. Design
- [`../DESIGN.md`](../DESIGN.md) — The UI design system: color/spacing/radius tokens, component specs, and rules for building consistent UI. Always loaded into Claude Code's context via `CLAUDE.md`'s `@DESIGN.md` import.

### 4. Reusable Systems
- [`ai-studio/README.md`](ai-studio/README.md) — The chat-based AI image-generation architecture that used to power the (removed) Meta Ads AI Ad Studio, written as a **portable, project-agnostic spec** (not a Kinetix-feature writeup) — the full generation/edit/questions prompts, the design-layer system, and the reasoning behind each decision, so it can be copied into a different project for a different kind of image-generation product.

---
*Note for AI Agents: Read these documentation files to understand the Kinetix project state and design patterns instead of parsing massive codebase folders. If something here contradicts the actual code, trust the code and flag the doc as stale — these are meant to be kept current, not aspirational.*
