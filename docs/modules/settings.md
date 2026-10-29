# Settings Module

**Status: built and active.**

## 1. What It Is

Settings is the one place every module reads its business-level context and automation defaults from — the business's identity, brand voice, service list, and every module's tunable defaults (Outreach pacing, Meta Ads defaults, the shared video character reference). One page (`/settings`), no sub-routes — organized entirely with in-page tabs, since a secondary sidebar for this few fields would be more navigation than the content warrants.

One shared dirty-check drives the whole page: local edits are compared against the last-fetched record, and a single floating save bar appears the moment anything's actually changed, regardless of which tab it's on — switching tabs never loses an edit, since every field lives in one in-memory form object.

## 2. Tabs

| Tab | What it holds |
|---|---|
| **General** | Business Identity — Business Name, Industry, Website URL, Description. |
| **Brand & Voice** | Tone of Voice, Business Voice Guidelines, Core Offerings, Pain Points, Target Audience — injected into every AI-generated ad script/email/caption so it sounds like this business, not a generic template. |
| **Services** | The list of services this business actually offers (name + description pairs) — read by Outreach's AI drafting and the Create Ad modal's service picker. |
| **Automation Defaults** | Three sections — see §2.1. |

### 2.1 Automation Defaults, in more detail

| Section | What it controls |
|---|---|
| **Outreach Defaults** | Daily Send Limit, Timezone, Sending Days (weekday toggle), and the send Window Start/End — every new Outreach campaign inherits these. |
| **Meta Ads Defaults** | One toggle: whether new Ad Sets start with Advantage+ Audience (Meta's automatic audience expansion) turned on. |
| **Video Character Reference** | Optional — locks every AI-generated video (Meta Ads *and* Social Media) to one real person's photo per gender, so the character stays visually consistent scene to scene. A toggle plus male/female reference-photo uploaders; Save is blocked until both photos are set once enabled. Image generation is never affected, video only. |

## 3. Data Model

Single row, `businesses` (single-tenant — read via `.limit(1).single()`, never scoped by a session). Columns this page reads/writes:

| Column(s) | Tab |
|---|---|
| `name`, `industry`, `description`, `website_url` | General |
| `tone_of_voice`, `business_voice`, `core_offerings`, `pain_points`, `target_audience` | Brand & Voice |
| `services` (jsonb array of `{name, description}`) | Services |
| `outreach_settings` (jsonb: `daily_limit`, `timezone`, `days`, `send_window: {from, to}`) | Automation Defaults → Outreach |
| `settings` (jsonb — specifically `settings.meta_ads.advantage_audience_default`) | Automation Defaults → Meta Ads |
| `video_reference_enabled`, `video_reference_male_url`, `video_reference_female_url` | Automation Defaults → Video Character Reference |

Deliberately **not** exposed here: `businesses.keywords`, `business_colors`, `guidelines` — these columns exist in the schema but have no real consumer anywhere in the app today, so they're left out rather than guessed at with a UI that doesn't do anything yet. `businesses.target_countries` is a separate, real gap worth knowing about: it's still read live as a default when launching a Meta Ads campaign (`useBusinessMetaAdsDefaults` in `src/modules/meta-ads/components/campaigns/shared.tsx`), but there is currently no Settings UI to edit it — the tab that used to expose it (alongside the now-removed competitor-analysis keyword/topic fields covered below) was removed without restoring an editor for this one still-live field. Not touched by the competitor/self-ad-analysis cleanup below; flagged here as a pre-existing gap.

## 4. Why It's Built This Way

- **One page, tabs instead of routes.** The alternative — a secondary sidebar with one tab per section — would add more chrome than the content justifies; a page this size doesn't need its own navigation layer.
- **One save bar, not one per section.** Editing across tabs is common (e.g. adjusting a service description, then the Outreach send window) — a per-section save would force committing one change before making the next, or losing it on tab switch.
- **Competitor Intelligence and Analysis Schedule were removed entirely** (their tab, the `ScheduleEditor`/`AdScriptTopicsEditor` components, the two background jobs, and the `ad_analysis_reports` table + related `businesses` columns) — the weekly self-ad-analysis and competitor-analysis features they configured were unused, so the whole surface came out rather than leaving dead settings around a dead feature.

<details>
<summary>Key implementation files (for developers going deeper)</summary>

| Concept | File |
|---|---|
| Page | `src/modules/settings/pages/SettingsPage.tsx` |
| Shared field/section components | `src/modules/settings/components/shared.tsx` |
| API route | `src/app/api/settings/route.ts` |

</details>
