# Kinetix Marketing Automation Platform

Kinetix is a single-tenant marketing automation platform built for one client (Kangrooo, a Canadian space and venue booking marketplace) with Next.js, Supabase, and Tailwind CSS. It consolidates four product areas — Meta Ads, Social Media, Outreach, and Settings — into one codebase, one Postgres schema, and one background-job runner (Inngest).

For a deeper tour of the system than this file covers, see [`docs/index.md`](docs/index.md). For AI-assistant-specific conventions (Claude Code), see [`CLAUDE.md`](CLAUDE.md) and [`DESIGN.md`](DESIGN.md).

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/en/) (v20 or higher)
- [npm](https://www.npmjs.com/)
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) (`npm install -g supabase`)
- A [Supabase](https://supabase.com/) account and project.

---

## 🚀 Project Setup & Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy the example environment file to create your local environment file:
```bash
cp .env.example .env.local
```
Open `.env.local` and fill in your actual Supabase credentials. You can find these in your Supabase Dashboard under **Project Settings > API**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required — Inngest background jobs use this to bypass RLS)

See `docs/architecture/system_design.md` and the module docs under `docs/modules/` for the AI-provider and integration keys (OpenAI, Kie AI, ElevenLabs, Apify, Instantly.ai, Meta, etc.) each feature needs.

### 3. Database Setup (Supabase)

Kinetix manages its schema entirely through Supabase migrations — there is no separate ORM (no Prisma, no Drizzle) in this project. All database access goes through the generated Supabase client types (`src/types/supabase.ts`).

**Step 3a: Login to Supabase CLI**
```bash
npx supabase login
```

**Step 3b: Link your project**
Find your Reference ID in your Supabase dashboard URL.
```bash
npx supabase link --project-ref <YOUR_REFERENCE_ID>
```

**Step 3c: Push the schema**
Push every migration in `supabase/migrations/` to your linked project:
```bash
npx supabase db push --linked
```

**Step 3d: Generate types**
```bash
npx supabase gen types typescript --project-id <YOUR_REFERENCE_ID> --schema public > src/types/supabase.ts
```
Don't redirect stderr into that file (`2>&1`) — a CLI notice on stderr gets appended after the generated code and breaks every consumer with unrelated-looking `tsc` errors.

### 4. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

Background jobs (Inngest) run against a local dev server at `http://localhost:8288` when `INNGEST_DEV=1` is set in `.env.local` — see `CLAUDE.md`'s "Background jobs" section for how job registration works.

---

## 📁 Project Structure

```text
kinetix/
├── src/
│   ├── app/                 # Next.js App Router (pages, layouts, API routes)
│   │   ├── (app)/           # Main dashboard routes, one folder per module
│   │   ├── (auth)/          # Public auth routes (login/signup)
│   │   └── api/             # API routes — thin, delegate to services/hooks
│   ├── components/
│   │   ├── ui/              # Shared design-system components (Button, Table, Dialog, …) — see DESIGN.md
│   │   ├── layout/           # App shell (Navbar, PrimarySidebar, SecondarySidebar)
│   │   └── global/          # Cross-module widgets (background job tracker, etc.)
│   ├── config/               # Route constants (routes.ts) and nav config (navigation.ts)
│   ├── modules/              # Domain-driven feature modules — the core logic
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── meta-ads/         # Ad creative generation, competitor/self-ad intelligence (built)
│   │   ├── social/            # OAuth, content generation, publishing (built)
│   │   ├── outreach/          # Lead lists, scraping, campaigns, Instantly.ai sending (built)
│   │   └── settings/
│   │       └── each module has its own pages/, components/, hooks/, services/, types/
│   ├── services/              # External integrations (Supabase, Inngest jobs, AI orchestrator, Instantly, Meta Graph API, …)
│   ├── prompts/               # AI prompt-building functions, one file per domain
│   ├── jobs/                  # Inngest background job definitions (*.job.ts)
│   ├── styles/                # globals.css — design tokens + Tailwind v4 setup
│   └── types/                 # Global TypeScript types, incl. generated Supabase types
├── supabase/
│   └── migrations/            # SQL migration files — the source of truth for the schema
├── docs/                       # Deep reference docs — architecture, modules, AI pipelines
└── public/                     # Static assets
```

## 🛠️ Architecture

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4
- **Backend/Database:** Supabase (PostgreSQL, Row Level Security, Supabase Auth)
- **Background jobs:** Inngest (event-driven step functions for long-running AI/scraping work)
- **Data fetching:** TanStack Query (`@tanstack/react-query`) + the Supabase JS client
- **AI providers:** OpenAI, Kie AI, ElevenLabs, AssemblyAI, Apify, Instantly.ai — always called through `aiOrchestrator` (`src/services/ai/orchestrator.ts`), never a provider SDK directly from a route

See [`docs/architecture/system_design.md`](docs/architecture/system_design.md) for the full request/job flow.
