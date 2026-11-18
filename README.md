# Kinetix Marketing Automation Platform

Kinetix is a single-tenant marketing automation platform built for one client, Kangrooo (a Canadian space and venue booking marketplace), with Next.js, Supabase, Tailwind CSS and Inngest. It is posting automation only: AI-generated content for Kangrooo's property listings, plus a social publishing tool.

What's in the app today:

| Module | Route | What it does |
|---|---|---|
| Dashboard | `/dashboard` | Social reach, followers and engagement rolled up live from Upload-Post |
| Content Gallery | `/content` | AI-generated property content (images, 30 s narrated videos, LinkedIn posts, blog posts) to review. **Testing phase:** generation is manual ("Generate now") and nothing is published. Once Live, blogs are published to WordPress automatically |
| Automation | `/content/automation` | Weekly frequency per content type, pause/resume, Testing mode |
| Listings | `/listings` | The property inventory that content automation rotates through |
| Social | `/social/posts`, `/social/published`, `/social`, `/social/connected-accounts` | Generate an AI image or upload media, preview it per platform, then publish now or schedule it through Upload-Post |
| Settings | `/settings` | Business identity, brand voice, and a usage/cost estimate |

The Meta Ads and Outreach modules have been removed.

For a deeper tour, see [`docs/index.md`](docs/index.md). For AI-assistant conventions (Claude Code), see [`CLAUDE.md`](CLAUDE.md) and [`DESIGN.md`](DESIGN.md).

## Prerequisites

- [Node.js](https://nodejs.org/en/) v22 or higher (the test runner uses `node:test` module mocks)
- [npm](https://www.npmjs.com/)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) (run through `npx supabase`)
- A [Supabase](https://supabase.com/) project
- API keys for OpenAI, Kie AI and Upload-Post

---

## 🚀 Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Environment variables
```bash
cp .env.example .env.local
```
Every variable is validated at startup by `src/config/env.ts` (zod). Add any new variable there too.

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Everything (Supabase Dashboard → Project Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Inngest jobs (they bypass RLS) and the scripts in `scripts/` |
| `OPENAI_API_KEY` | Text: planning, copy, review, vision checks |
| `KIE_API_KEY` | Image generation and Seedance 2.5 video |
| `UPLOAD_POST_API_KEY`, `UPLOAD_POST_PROFILE` | Social publishing, connected accounts, dashboard analytics and the FFmpeg renderer |
| `STORAGE_PROVIDER` | Media storage backend (default `supabase`) |
| `WORDPRESS_URL`, `WORDPRESS_USERNAME`, `WORDPRESS_APP_PASSWORD` | Publishing Live blogs to WordPress (an application password, not the wp-admin password). Check with `node --env-file=.env.local scripts/check-wordpress.mjs` |
| `WORDPRESS_CATEGORY_ID` | Optional category for automated blog posts |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Background jobs in production |
| `INNGEST_DEV` | `1` locally to use the Inngest dev server. **Must be unset or `0` in production** |
| `LOG_LEVEL` | Optional pino log level |
| `NEXT_PUBLIC_APP_URL` | Base URL of the app (default `http://localhost:3000`) |

### 3. Database (Supabase)

The schema is managed entirely by SQL migrations in `supabase/migrations/`. There's no ORM: all access goes through the Supabase client, typed by the generated `src/types/supabase.ts`.

```bash
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase db push --linked
npx supabase gen types typescript --project-id <YOUR_PROJECT_REF> --schema public > src/types/supabase.ts
```
Don't redirect stderr into the types file (`2>&1`). A CLI notice on stderr gets appended after the generated code and breaks every consumer with unrelated-looking `tsc` errors.

### 4. Create the login

There's no public signup. Create (or reset) the single user:
```bash
ADMIN_PASSWORD='...' node --env-file=.env.local scripts/create-admin-user.mjs [username]
```
A bare username signs in as `<username>@kangrooo.com` (default `kangrooo`).

### 5. Run it
```bash
npm run dev                      # http://localhost:3000
npx inngest-cli@latest dev       # Inngest dev server at http://localhost:8288 (with INNGEST_DEV=1)
```

---

## 🧪 Checks

```bash
npx tsc --noEmit                                  # Typecheck
npm run lint                                      # ESLint (has pre-existing errors today)
node --test scripts/tests/*.test.mjs              # Unit tests (pure logic, no network or DB)
node --experimental-test-module-mocks --import ./scripts/tests/alias-register.mjs \
  --test scripts/tests/legacy-social-routes.test.mjs   # This file needs module mocks
```

---

## 📁 Project structure

```text
kinetix/
├── src/
│   ├── app/
│   │   ├── (app)/            # Signed-in pages: dashboard, content, listings, social, settings (thin files)
│   │   ├── (auth)/login/     # The only public page
│   │   └── api/              # API routes: business, content, dashboard, inngest, listings, profile, settings, social, usage
│   ├── components/
│   │   ├── ui/               # Shared design-system components (Button, Table, Dialog, Drawer, …), see DESIGN.md
│   │   ├── layout/           # App shell: Navbar, Sidebar, ProfileMenu
│   │   ├── global/           # Cross-module widgets: DashboardKit, TabSwitch
│   │   └── providers/        # QueryProvider, SessionBootstrap
│   ├── config/               # env.ts (validated env), routes.ts, navigation.ts, nav-active.ts
│   ├── modules/              # One folder per module: auth, content, dashboard, listings, settings, social
│   │                         #   each with pages/, components/, hooks/, and lib/, services/, types/ as needed
│   ├── services/
│   │   ├── ai/               # aiOrchestrator plus the OpenAI and Kie providers
│   │   ├── content-automation/  # Strategy, agents, QA, scheduling, rotation claims, video spec, branding, publish worker
│   │   ├── inngest/          # Inngest client, the registered functions list, content and social jobs
│   │   ├── upload-post/      # Upload-Post publishing, profiles, analytics, status
│   │   ├── wordpress/        # WordPress REST client (Live blog publishing)
│   │   ├── ffmpeg/           # Upload-Post's hosted FFmpeg renderer
│   │   ├── storage/          # Media storage
│   │   └── logger/           # pino logger
│   ├── jobs/                 # social-scheduled-post-check.job.ts
│   ├── prompts/              # Prompt builders: content-automation/, social-media/
│   ├── lib/                  # Supabase clients, business lookup, pagination, cost estimates
│   ├── store/                # zustand stores (user, business)
│   ├── styles/globals.css    # Design tokens and Tailwind v4 setup
│   ├── types/                # Shared types, including generated supabase.ts
│   └── proxy.ts              # Next 16 middleware: no session → /login (API routes aren't gated)
├── supabase/
│   ├── migrations/           # SQL migrations, the source of truth for the schema
│   └── config.toml
├── scripts/
│   ├── create-admin-user.mjs
│   ├── check-wordpress.mjs   # Read-only WordPress credentials check
│   ├── inventory-import/     # Normalize content.xlsx → upsert properties (dry-run by default)
│   └── tests/                # node:test unit tests
└── docs/                     # Architecture and module reference docs
```

## 🛠️ Architecture

- **Frontend:** Next.js 16 (App Router, dev server on webpack), React 19, Tailwind CSS v4, TanStack Query v5, zustand
- **Backend/database:** Next.js API routes; Supabase (PostgreSQL, Row Level Security, Supabase Auth with email/password only)
- **Background jobs:** Inngest. Every function is listed in `src/services/inngest/functions.ts`, and the weekly content cron is declared on the function itself (there's no Vercel cron).
- **AI:** OpenAI (text) and Kie AI (images, Seedance 2.5 video with native narration). Always called through `aiOrchestrator` (`src/services/ai/orchestrator.ts`).
- **Media and publishing:** Upload-Post handles social publishing and analytics and hosts the FFmpeg renderer (logo overlay, fade, end card); sharp stamps the logo on images. Kinetix does no social OAuth itself: accounts are connected on Upload-Post.

See [`docs/architecture/system_design.md`](docs/architecture/system_design.md) for the full request and job flow, and [`docs/architecture/content_automation.md`](docs/architecture/content_automation.md) for content automation.
