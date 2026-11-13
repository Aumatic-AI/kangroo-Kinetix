# Settings Module

**Status: built and active.**

## 1. What It Is

Settings is the one place the app reads its business-level context from: the business's identity, brand voice and service list, plus a usage/cost estimate. One page (`/settings`), no sub-routes, organized with in-page tabs.

Content-automation settings (weekly frequencies, pause, mode) are **not** here. They live on the Automation page (`/content/automation`, see `../architecture/content_automation.md`).

One shared dirty-check drives the editable tabs: local edits are compared against the last-fetched record, and a single floating save bar appears the moment anything's actually changed, regardless of which tab it's on. Switching tabs never loses an edit, since every field lives in one in-memory form object.

## 2. Tabs

| Tab | What it holds |
|---|---|
| **General** | Business Identity: Business Name, Industry, Website URL, Contact Phone, Brand Color, Description. |
| **Brand & Voice** | Tone of Voice, Business Voice Guidelines, Core Offerings, Pain Points, Target Audience. |
| **Services** | The services this business offers (name + description pairs). |
| **Usage** | "Usage & Estimated Cost" per month (`UsageSettings.tsx` → `GET /api/usage`): real counts from the database combined with modeled per-unit rates in `src/lib/costEstimates.ts`. It's an estimate, not measured provider spend. |

## 3. Data Model

Single row, `businesses` (single-tenant: read via `.limit(1).single()`, never scoped by a session). Columns `GET/PATCH /api/settings` reads and writes:

| Column(s) | Tab | Who reads it besides Settings |
|---|---|---|
| `name`, `industry` | General | Content automation (`generate-creative.ts`, `generate-blog.ts`) and Social caption prompts (`src/prompts/social-media/index.ts`) |
| `description`, `website_url` | General | `description`: content automation. `website_url`: Settings only |
| `contact_phone` | General | Nothing else reads it |
| `business_colors` (`{ primary }`, from "Brand Color") | General | Nothing else reads it |
| `tone_of_voice` | Brand & Voice | Content automation |
| `business_voice`, `target_audience` | Brand & Voice | Content automation and Social caption prompts |
| `core_offerings`, `pain_points` | Brand & Voice | Social caption prompts |
| `services` (jsonb array of `{name, description}`) | Services | Social image prompt (`src/prompts/social-media/image.ts`) |
| `target_countries` | — (no UI) | Content automation prompts. The API round-trips it, but no field edits it. |

Deliberately **not** exposed: `businesses.keywords` and `guidelines`. These columns exist but nothing in the app reads them.

**Stale UI copy:** the Contact Phone and Brand Color hints, and the Brand & Voice description, still mention "AI Ad Studio" and "ad script". Both were removed with Meta Ads. Fix the copy in `SettingsPage.tsx`; this doc already reflects the current behaviour.

## 4. Why It's Built This Way

- **One page, tabs instead of routes.** A secondary sidebar with one tab per section would add more chrome than the content justifies.
- **One save bar, not one per section.** Editing across tabs is common (e.g. adjusting a service description, then the brand voice); a per-section save would force committing one change before making the next, or losing it on tab switch.
- **Removed features don't leave settings behind.** Competitor Intelligence / Analysis Schedule, the Meta Ads defaults and the video character-reference photos were all removed together with the features they configured (see `../architecture/database_schema.md` §11).

<details>
<summary>Key implementation files (for developers going deeper)</summary>

| Concept | File |
|---|---|
| Page | `src/modules/settings/pages/SettingsPage.tsx` |
| Shared field/section components | `src/modules/settings/components/shared.tsx` |
| Usage tab | `src/modules/settings/components/UsageSettings.tsx`, `src/app/api/usage/route.ts` |
| API route | `src/app/api/settings/route.ts` |

</details>
