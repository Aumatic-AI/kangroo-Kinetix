# Kangrooo Content Automation System
## Product Requirements & Technical Implementation Specification

**Document type:** Product and Engineering Source of Truth  
**Version:** 1.1 (requirements unchanged from 1.0; implementation status added)  
**Date:** October 30, 2026 · status updated November 13, 2026  
**Product:** Kangrooo  
**Scope:** Automated property promotion, AI content generation, weekly scheduling, content gallery, and social media publishing.

---

# 0. Implementation Status (as of November 13, 2026)

This section records what the code on `main` actually does. The requirements below are unchanged, except where a section carries a **Status** note recording a product decision that replaced it. How it works is described in [`architecture/content_automation.md`](architecture/content_automation.md).

The system is in its **testing phase**. Content is generated only from the gallery's "Generate now" button, kept in the private gallery, and never published.

| Phase (§20) | State |
|---|---|
| 1. Inventory and foundation | **Done.** Property import (`scripts/inventory-import/`), Listings module, Outreach removed (Meta Ads also removed). |
| 2. Settings and Testing mode | **Done, Testing only.** Two independent frequencies (plus a blog frequency), pause/resume, Testing mode enforced in the database. Live mode is refused by the settings API. |
| 3. AI content generation | **Done**, except that video is always one 30 s clip (see §6). Rotation, social and LinkedIn agents, scripts, images, narrated video, validation, revisions and regeneration all work. |
| 4. Weekly orchestration and scheduling | **Built, switched off.** The weekly cycle (Fri 18:00 America/Toronto) and the whole-week planner exist, but only run with `auto_run_enabled`, which the API refuses to set. Times use the business timezone. |
| 5. Social media publishing | **Not wired.** A publishing worker with all its safety checks exists (`src/services/content-automation/publish.ts`), but nothing schedules it and nothing creates the post records it would publish. |
| 6. Analytics and optimization | **Not started.** `content_performance` exists but nothing writes to it. |

**Not built yet:**
- Video length chosen by the AI (30 s vs 2 × 20 s): replaced by a product decision, see §6.
- Live publishing and the scheduling step that creates publishing records.
- Audience or property timezones.
- Performance collection, and using it in scheduling.
- Automation status on the Dashboard (§18.1).
- Gallery filters for pipeline, environment, scheduled/published, property and date range (§11.2). The API supports most of them; the UI has only content type and generation status.
- A marker for an incomplete week (§9.3).
- Video usage count and next planned promotion in Listings (§18.2).
- Audio-sync and narration-completeness checks on rendered video (§6.4).

**Built beyond or against this spec:**
- A display-only **blog** pipeline (§22 lists blogs as out of scope).
- A **permanent delete** for gallery items (`delete_content_item`), which removes a creative and all its revisions. This conflicts with §11.5 / §12.2's "preserve history"; the rotation history (`property_promotions`) is kept.
- The data model differs from §15 in documented ways: there is no `content_schedule` table (the `social_posts` row is the schedule), and video usage counts are derived rather than stored. See the architecture doc's §8.

**Open decisions (§23) that have been decided in code:**
- #2 weekly trigger: Friday 18:00 America/Toronto.
- #3 frequency limits: 0–14 per pipeline.
- #4 rotation: one shared promotion history with per-pipeline fairness; blogs rotate separately.
- #5 eligibility: an active listing needs at least one image not marked broken.
- #6 publish failures: retried with backoff (up to 3), more than 6 h late means skipped, and an uncertain outcome is never retried automatically.
- #7 mode switching: Live → Testing or pause holds scheduled live posts.
- #10 video provider: Seedance 2.5, one 30 s clip with native narration.

Still open: #1 (platform API capabilities), #8 (analytics availability), #9 (scheduling model beyond the current heuristic).

---

# 1. Product Vision

Kangrooo is an autonomous property-content marketing system.

Its purpose is to promote Kangrooo's venue and property listings across social media without requiring users to manually create content, write captions, select publishing dates, or schedule individual posts.

The AI system is responsible for:

1. Managing the rotation of active property listings.
2. Selecting properties for upcoming promotional content.
3. Generating promotional scripts, videos, images, and captions.
4. Choosing the appropriate video generation format.
5. Creating different content strategies for different social platform groups.
6. Determining the best publishing days and times.
7. Generating the upcoming week's content in advance.
8. Publishing automatically according to configured frequencies.
9. Recording content history and performance to improve future decisions.

The user should primarily configure the automation, monitor its activity, manage property listings, and inspect generated content through the gallery.

**Core principle: Kangrooo is an automation platform, not a manual social media content editor.**

# 2. Core Product Requirements

The system must follow these principles:

- Content generation is autonomous.
- Property promotion follows a sequential rotation strategy.
- Publishing frequency is controlled by the user.
- AI chooses the specific publishing days and times.
- The user does not manually select individual publishing dates.
- TikTok, Instagram, and Facebook share one content-generation pipeline.
- LinkedIn has a separate professional-content pipeline.
- LinkedIn must never receive video posts.
- Video generation supports two formats: one 30-second video or two connected 20-second clips combined into a 40-second video.
- The AI decides which video format is appropriate for the script.
- The next week's content is generated ahead of time.
- Generated content is visible in the Kangrooo gallery.
- Production publishing is automatic and does not require individual post approval.
- During initial testing, generated content must remain private in the gallery and must not be published to social accounts.
- Test content must never automatically enter the live publishing queue when the system changes modes.

# 3. Social Media Platform Architecture

The four supported platforms are:

- TikTok
- Instagram
- Facebook
- LinkedIn

They are divided into two independent content pipelines.

## 3.1 Social and Promotional Pipeline

**Platforms:** TikTok, Instagram, Facebook

These platforms share the same generated creative.

Supported content:
- Promotional videos.
- Image posts.

Content strategy:
- Entertaining.
- Creative.
- Attention-grabbing.
- Story-driven.
- Promotional and advertisement-oriented.
- Visually engaging.
- Focused on showcasing the property and its possible uses.

The AI generates one creative asset for the platform group rather than independently generating three different videos or images.

The same video or image is distributed to TikTok, Instagram, and Facebook.

Captions, hashtags, and platform-specific metadata may be adapted for each platform without creating three separate creative assets.

## 3.2 LinkedIn Professional Pipeline

**Platform:** LinkedIn

Supported content:
- Text + image posts only.

Video generation and video publishing are not supported for LinkedIn.

Content strategy:
- Professional.
- Informative.
- Business-oriented.
- Credible.
- Educational.
- Focused on business events, professional meetings, networking, workspaces, and commercial uses of venues.

The LinkedIn AI must use a separate content-generation prompt and strategy.

It must not simply reuse entertaining TikTok-style scripts or captions.

## 3.3 Pipeline Independence

The two pipelines operate independently.

For example, if the configured frequencies are:

- Social pipeline: 3 posts per week.
- LinkedIn pipeline: 2 posts per week.

The weekly generation system must produce:
- Three social creative assets, each distributed to TikTok, Instagram, and Facebook.
- Two LinkedIn text + image posts.

This results in five creative assets and up to eleven platform-specific publishing records per week.

A failure in one pipeline must not prevent the other pipeline from generating or publishing its content.

# 4. Content Frequency and Scheduling

The user controls only two weekly frequency settings.

## 4.1 User-Controlled Settings

**Setting A: Social posting frequency**

Controls the number of weekly creative assets generated and published across TikTok, Instagram, and Facebook.

**Setting B: LinkedIn posting frequency**

Controls the number of weekly LinkedIn text + image posts.

These are the only posting-frequency controls required.

The user must not have to select:
- Individual posting days.
- Individual posting times.
- Properties for individual posts.
- Captions.
- Scripts.
- Video durations.
- Content formats.

Those decisions belong to the AI system.

## 4.2 AI-Controlled Scheduling

The AI determines the posting schedule based on:

- Configured weekly frequency.
- Property location and its timezone.
- Target audience location.
- Social platform.
- Content format.
- Content category.
- Historical engagement data, when available.
- Previously scheduled posts.
- Spacing between posts.
- Platform-specific posting patterns.

The scheduling system must select suitable days and times for the following week.

For example, if social frequency is three posts per week, the AI might select Monday, Wednesday, and Saturday.

If LinkedIn frequency is two posts per week, it might select Tuesday and Thursday.

These are illustrative examples, not fixed scheduling rules.

## 4.3 Scheduling Principles

- Avoid unnecessarily clustering posts.
- Respect the configured weekly frequency.
- Avoid scheduling multiple posts for the same pipeline too close together.
- Store the selected timezone alongside the scheduled time.
- Store timestamps in UTC and convert them for display.
- Use the target audience's local timezone where that audience is known.
- Use property location as a fallback when target audience information is unavailable.
- Avoid claiming that an AI-selected time is guaranteed to be optimal.

Initially, the scheduling engine can use sensible heuristics. Once engagement data accumulates, it can use historical performance to improve its recommendations.

## 4.4 Frequency Is Not Property Frequency

The configured frequency refers to the number of posts generated for each pipeline, not the number of posts per property.

The property rotation system decides which properties are featured in those weekly slots.

# 5. Property Rotation System

Kangrooo promotes multiple property and venue listings.

The system must maintain a sequential rotation of eligible properties.

## 5.1 Property Selection

The AI should select properties from the active listing inventory.

The rotation should:
- Give active properties fair promotional coverage.
- Avoid repeatedly selecting the same property while others remain unpromoted.
- Track the last promotional activity for each property.
- Track how many times each property has been used.
- Skip inactive or unavailable listings.
- Preserve the rotation position when new listings are added.
- Continue the rotation when a previously inactive listing becomes active again, subject to its current eligibility.

The system should not randomly select properties without considering promotion history.

## 5.2 Adding Properties

New property records should enter the active inventory and be appended to the rotation.

Adding a property must not reset the existing rotation or interrupt already generated content.

Property inventory should be managed through listing management or an import/synchronization process, not through a manual content-creation workflow.

## 5.3 Removing or Deactivating Properties

Deactivating a property should:
- Exclude it from future property selection.
- Prevent new content generation for it.
- Prevent future unpublished content from being published if it is no longer eligible.
- Preserve its historical generated content.
- Preserve published content and performance history.

Deleting a property should be treated separately from deactivation and should require appropriate historical-data handling.

## 5.4 Property Promotion History

The system should maintain:
- Last used for video.
- Video usage count.
- Last promotional date.
- Total generated content count.
- Published content count.
- Last selected position in the rotation.
- Current eligibility status.

These values should be maintained automatically.

# 6. Video Generation System

> **Status: replaced by a product decision.** Every video is exactly **one 30-second clip** (Seedance 2.5, 9:16, 480p, native narration), and the AI chooses neither length nor clip count (`src/services/content-automation/video-spec.ts`). Code then adds the Kangrooo logo, a 0.5 s fade to black and a 1 s logo end card, so the final file is about 31 s. Format B (2 × 20 s) and §6.3 format selection are not implemented. The database still allows `two_clip` for older rows. The AI does decide **image vs video** for each social creative. Of §6.4's checks, duration, aspect ratio, resolution, codecs, audio track and upload are verified on the real file; audio sync and narration completeness are not.

The social pipeline supports two video-generation formats.

The AI selects the format after creating and evaluating the promotional script.

## 6.1 Format A: Single 30-Second Video

The system generates one complete video with a target duration of 30 seconds.

Suitable for:
- Short promotional messages.
- Simple concepts.
- One central idea.
- Concise property showcases.
- Straightforward storytelling.

The complete video is generated in one video-generation request.

## 6.2 Format B: Two Connected 20-Second Videos

The system generates two separate 20-second clips.

- Part 1: 20 seconds.
- Part 2: 20 seconds.
- Combined final duration: approximately 40 seconds.

The two clips are assembled into one final video.

Suitable for:
- More complex storytelling.
- Multiple scenes.
- A stronger narrative.
- Detailed property showcases.
- Concepts requiring more development.

The final result must be one continuous 40-second promotional video, not two separately published posts.

## 6.3 AI Format Selection

The AI should consider:

- Script length.
- Narration duration.
- Number of scenes.
- Story complexity.
- Concept development.
- Number of property features being showcased.
- Whether a natural transition between two clips is possible.

The AI should output its selected format and a brief internal reason.

The backend must validate the script and generation request before starting video production.

## 6.4 Video Production Validation

The video pipeline must validate:
- Actual clip duration.
- Audio synchronization.
- Narration completeness.
- Clip continuity.
- Aspect ratio.
- Video resolution.
- Missing or corrupted scenes.
- Final combined duration.
- Successful media upload.

For the two-clip format, the backend must ensure the clips are combined in the correct order and the final audio is continuous.

A failed generation must not be marked as successful or published.

# 7. Image Generation System

Image posts are supported by the social pipeline and the LinkedIn pipeline.

For the social pipeline:
- Generate promotional and visually engaging image creatives.
- Reuse the same image creative across TikTok, Instagram, and Facebook.
- Generate suitable captions and hashtags for each platform.

For LinkedIn:
- Generate or select an appropriate image.
- Pair the image with professional text.
- Do not generate or attach video content.

Image generation must use the property's actual reference images and available listing information.

The AI must not invent property amenities, facilities, dimensions, pricing, capacity, availability, or other unsupported details.

# 8. LinkedIn Content Generation

LinkedIn must have a separate content-generation strategy.

Each LinkedIn post consists of:
1. Professional written content.
2. One associated image.
3. Appropriate hashtags and metadata.

Potential content themes include:
- Business meetings.
- Corporate events.
- Professional networking.
- Team-building activities.
- Workshops and presentations.
- Startup events.
- Workspace benefits.
- Venue use cases.

The AI should use the property's category and supported event types to determine relevant content themes.

The LinkedIn pipeline must never generate video posts.

# 9. Weekly Content Generation

The system must generate content for the following week ahead of publication.

It must not depend on generating content at the exact moment a post is due.

## 9.1 Weekly Workflow

1. Start the weekly automation cycle.
2. Load automation settings.
3. Load active property listings.
4. Determine the number of required posts for both pipelines.
5. Select eligible properties using the rotation system.
6. Generate the social pipeline's scripts and creative assets.
7. Generate LinkedIn professional content and images.
8. Determine video formats where applicable.
9. Generate captions and platform-specific metadata.
10. Select publishing days and times.
11. Validate all generated content.
12. Save generated content and schedule information.
13. Make the upcoming week's content visible in the gallery.
14. If operating in live mode, prepare approved-by-policy content for automatic publishing.
15. If operating in testing mode, keep all content private and do not publish.

The generation process should be asynchronous and resilient to individual failures.

A failed property generation should not cancel the entire weekly cycle.

## 9.2 Weekly Generation Window

The system should maintain a configurable weekly generation window.

The default recommendation is to prepare the next week's content before that week begins.

The exact generation day and time should be an implementation setting rather than a hardcoded product assumption.

## 9.3 Incomplete Weekly Generation

If some content fails to generate:
- Keep successful content.
- Mark failed jobs separately.
- Retry transient failures.
- Avoid duplicating successful content.
- Continue with other eligible properties.
- Record the reason for failure.

The system should make it clear when a week's content is incomplete.

# 10. Operating Modes

Kangrooo has two operating modes.

## 10.1 Testing Mode

Testing mode is intended for initial video-generation and content-quality testing.

Behavior:
- AI generates content automatically.
- Content is saved in Kangrooo's private gallery.
- Videos, images, scripts, captions, and proposed publishing times remain visible internally.
- Nothing is published to TikTok.
- Nothing is published to Instagram.
- Nothing is published to Facebook.
- Nothing is published to LinkedIn.
- No real social publishing job should be dispatched.

The purpose is to test generation quality without flooding connected social accounts with test data.

Testing mode must not require individual approval for every generated item.

The user can inspect, compare, and regenerate content from the gallery.

## 10.2 Live Automation Mode

Live mode is the normal production behavior.

Behavior:
- Weekly content is generated automatically.
- AI selects the publishing schedule.
- Content enters the publishing pipeline.
- Approved-by-system content is automatically published at its scheduled time.
- No manual post approval is required.
- The gallery retains the content and publishing history.

## 10.3 Mode Switching Safeguards

Changing from Testing Mode to Live Mode must not publish old test content.

Rules:
- Existing test content remains historical gallery content.
- Test content must not be automatically promoted into the live publishing queue.
- Only content generated for a live-mode schedule is eligible for automatic publishing.
- Publishing workers must independently verify the mode and content eligibility before publishing.
- A mode change must not bypass platform connection checks or content validation.

A future explicit feature could allow an individual test item to be manually promoted into a live campaign, but this is outside the initial requirements.

## 10.4 Pausing Automation

Pausing automation should stop new generation cycles and prevent new publishing actions.

Already published content and historical records remain unchanged.

The system must define how already scheduled posts are handled when automation is paused. Recommended behavior: hold pending posts and resume them only after checking that their schedules are still valid.

# 11. Content Gallery

The gallery is the primary interface for inspecting AI-generated content.

It must support both testing and live operation.

## 11.1 Gallery Content Types

- Videos.
- Image posts.
- LinkedIn text + image posts.

## 11.2 Gallery Filters

Recommended filters:
- All content.
- Videos.
- Images.
- LinkedIn.
- Social pipeline.
- Testing content.
- Scheduled.
- Published.
- Failed.
- Property.
- Date range.

## 11.3 Content Card Information

Each card should show:
- Property name.
- Preview image or video.
- Content type.
- Platform or platform group.
- Generated date.
- Proposed publishing date and time.
- Generation status.
- Publishing status.
- Video duration, when applicable.

## 11.4 Content Detail View

Opening a content item should display:
- Full video or image preview.
- Script or generated text.
- Captions.
- Hashtags.
- Property information.
- Target platforms.
- Scheduled time and timezone.
- Generation history.
- Publishing history.
- Error information, when applicable.

## 11.5 Regeneration

The user must be able to regenerate content from the gallery for testing and quality improvement.

Regeneration must:
- Create a new content revision.
- Preserve the previous version.
- Record the generation request and result.
- Avoid automatically publishing a regenerated item outside the live scheduling process.
- Revalidate the new revision before it becomes publishable.

The gallery is not intended to become a manual post composer.

# 12. Property Inventory and Data Source

The supplied `content.pdf` contains an existing venue/property inventory and historical content records.

It is an initial source for importing Kangrooo's listings.

The inventory includes these fields:

| Source field | Meaning / treatment |
|---|---|
| `title` | Property or venue name |
| `space_categories` | Property category |
| `event_types_supported` | Supported event types |
| `last_used_for_video` | Historical video usage |
| `video_use_count` | Historical video count |
| `content_status` | Existing content status |
| `location` | Property location |
| `image1`–`image5` | Property reference images |
| `blog_type` | Existing blog classification |
| `blog_status` | Existing blog status |
| `video_status` | Existing video status |
| `image_post_status` | Existing image-post status |
| `script_type` | Existing script classification |

The PDF also contains historical content exports:

**Blog records**
- `property`
- `blog_url`
- `created_date`
- `post_status`

**Image post records**
- `Property Title`
- `post1`
- `Captions`
- `Hastags`
- `Post_status`

**Video records**
- `property_title`
- `video_url`
- `last_used_for_video`
- `Post_status`
- `created_date`

These historical records should be imported or associated with the correct property where practical.

They must not be mistaken for future scheduled content.

## 12.1 Inventory Limitations

The supplied inventory does not establish that every property has:
- Full street address.
- Pricing.
- Capacity.
- Availability.
- Amenities.
- Booking information.
- Complete marketing descriptions.

The AI must not fabricate these details.

If more detailed property information becomes available from a trusted source, it can be added to the property record later.

## 12.2 Property Management

The system should provide:
- Property inventory listing.
- Property detail pages.
- Image gallery.
- Activation and deactivation.
- Promotion history.
- Generated-content history.
- Rotation information.

Property records are persistent entities. Generated content and historical records should not be deleted just because a property is deactivated.

# 13. AI Architecture

The system should use one central orchestration layer with specialized responsibilities.

## 13.1 Weekly Content Orchestrator

Responsible for:
- Starting weekly generation.
- Loading configuration.
- Calculating required content counts.
- Coordinating both pipelines.
- Tracking job progress.
- Handling retries.
- Preventing duplicate weekly cycles.

## 13.2 Property Rotation Manager

Responsible for:
- Selecting eligible properties.
- Tracking usage.
- Maintaining sequential rotation.
- Skipping inactive listings.
- Appending new listings.
- Preventing unnecessary repeated promotion.

## 13.3 Social Content Agent

Responsible for:
- TikTok, Instagram, and Facebook promotional concepts.
- Script generation.
- Video format selection.
- Image creative generation.
- Captions and hashtags.
- Platform-specific metadata.

## 13.4 LinkedIn Content Agent

Responsible for:
- Professional content concepts.
- Text generation.
- Image selection or generation.
- Professional captions and hashtags.
- LinkedIn-specific content validation.

It must not generate video content.

## 13.5 Video Generation Orchestrator

Responsible for:
- Accepting the script and selected duration.
- Running one 30-second generation or two 20-second generations.
- Combining two clips when required.
- Handling retries.
- Validating final media.
- Saving the finished asset.

## 13.6 AI Scheduling Engine

Responsible for:
- Choosing weekly publishing days.
- Choosing local publishing times.
- Respecting frequency settings.
- Considering audience and platform behavior.
- Avoiding schedule conflicts.
- Recording timezone information.

The AI proposes a schedule; deterministic backend validation is responsible for enforcing it.

## 13.7 Publishing Service

Responsible for:
- Reading eligible publishing jobs.
- Checking live mode.
- Checking platform connection status.
- Checking media and post validity.
- Publishing at the correct time.
- Recording platform responses.
- Handling retries and failures.
- Preventing duplicate posts.

# 14. Recommended Technical Architecture

The system should separate generation, scheduling, and publishing.

These are different operations and should not be implemented as one long synchronous request.

Recommended logical components:

1. Application backend.
2. AI orchestration service.
3. Property rotation service.
4. Video and image generation integrations.
5. Media storage.
6. Weekly scheduling service.
7. Background job queue.
8. Social publishing integrations.
9. Content gallery.
10. Analytics and performance collection.

If the existing Kinetix codebase is used as the foundation, reuse its existing business, media, social-post, and creative-studio functionality wherever appropriate.

Do not duplicate an existing capability without first checking the current implementation.

## 14.1 Kinetix Functionality to Evaluate for Reuse

The previously reviewed Kinetix architecture contains these relevant areas:

- `profiles`, `businesses`, `business_users`: user and business management.
- `platform_connections`: social account connections.
- `api_credentials`: API credential management.
- `media_assets`: media storage and organization.
- `social_posts`: social post records and publishing statuses.
- `studio_sessions`, `studio_messages`: creative studio interactions.
- `meta_ad_creatives`: advertising creative records.
- `prompt_overrides`: prompt customization.
- `upload_post_analytics_cache`: analytics-related data.
- `ad_performance_daily`: advertising performance records.

The previously reviewed architecture also includes outreach-specific tables:

- `outreach_campaigns`
- `email_events`
- `outreach_lead_lists`
- `outreach_leads`
- `outreach_campaign_leads`
- `outreach_campaign_lists`

Outreach is outside the Kangrooo content-automation scope. Its UI, routes, workers, prompts, settings, and tables should be removed only after dependency checks.

Meta advertising leads are distinct from outreach prospecting leads. They should not be removed automatically.

> **Status:** Outreach was removed (`20261101000000_remove_outreach.sql`). The whole Meta Ads module was later removed too, by explicit product decision (`20261104000000_remove_meta_ads.sql`): `studio_sessions`/`studio_messages`, `meta_ad_creatives`, `ad_performance_daily` and the leads table are gone. `upload_post_analytics_cache` remains but is unused.

These findings are based on the previously reviewed Kinetix schema and architecture, not a complete verification of every repository implementation.

# 15. Recommended Data Model

The following is a proposed logical data model. Exact table names and relationships should be reconciled with the existing database before migrations are created.

## 15.1 `properties`

Stores property and venue information.

Suggested fields:
- `id`
- `business_id`
- `title`
- `location`
- `space_categories`
- `event_types_supported`
- `is_active`
- `rotation_position`
- `last_used_for_video`
- `video_use_count`
- `created_at`
- `updated_at`

Property media can use the existing `media_assets` table or a dedicated association table.

## 15.2 `content_automation_settings`

Stores automation configuration.

Suggested fields:
- `id`
- `business_id`
- `social_frequency_per_week`
- `linkedin_frequency_per_week`
- `automation_mode`
- `is_enabled`
- `generation_timezone`
- `created_at`
- `updated_at`

`automation_mode` should support:
- `testing`
- `live`

The two frequencies must remain independent.

## 15.3 `content_generation_cycles`

Tracks each weekly generation cycle.

Suggested fields:
- `id`
- `business_id`
- `week_start`
- `week_end`
- `status`
- `automation_mode`
- `social_target_count`
- `linkedin_target_count`
- `social_generated_count`
- `linkedin_generated_count`
- `started_at`
- `completed_at`

A unique constraint should prevent duplicate cycles for the same business and week.

## 15.4 `content_generation_queue`

Tracks individual generation jobs.

Suggested fields:
- `id`
- `cycle_id`
- `property_id`
- `pipeline_type`
- `content_type`
- `generation_status`
- `generation_attempts`
- `error_message`
- `created_at`
- `completed_at`

Pipeline types:
- `social`
- `linkedin`

Generation statuses:
- `pending`
- `processing`
- `completed`
- `failed`
- `cancelled`

## 15.5 `property_content`

Stores generated content.

Suggested fields:
- `id`
- `business_id`
- `property_id`
- `cycle_id`
- `pipeline_type`
- `content_type`
- `script`
- `caption`
- `hashtags`
- `media_asset_id`
- `video_duration`
- `generation_status`
- `environment_mode`
- `created_at`
- `updated_at`

Content types:
- `video`
- `image`
- `text_image`

The generated creative should be separate from its platform-specific publishing records.

## 15.6 `content_revisions`

Stores regenerated versions.

Suggested fields:
- `id`
- `property_content_id`
- `revision_number`
- `script`
- `caption`
- `hashtags`
- `media_asset_id`
- `generation_prompt`
- `created_at`

Previous revisions should remain available for history and comparison.

## 15.7 `content_schedule`

Stores publishing schedules.

Suggested fields:
- `id`
- `property_content_id`
- `platform`
- `scheduled_at`
- `timezone`
- `status`
- `published_at`
- `platform_post_id`
- `error_message`
- `created_at`
- `updated_at`

For the shared social pipeline, one creative should be associated with three platform-specific publishing records.

For LinkedIn, one creative should be associated with one LinkedIn publishing record.

## 15.8 `publishing_logs`

Stores publishing attempts and results.

Suggested fields:
- `id`
- `content_schedule_id`
- `attempt_number`
- `request_metadata`
- `response_metadata`
- `status`
- `error_message`
- `created_at`

This makes publishing retries auditable.

## 15.9 `content_performance`

Stores engagement information where supported by the platform integrations.

Suggested fields:
- `id`
- `content_schedule_id`
- `impressions`
- `reach`
- `likes`
- `comments`
- `shares`
- `clicks`
- `collected_at`

Not every platform exposes the same metrics. Unsupported metrics must remain null rather than being fabricated.

# 16. Content and Publishing State Management

Generation status and publishing status should be separate.

## 16.1 Generation Lifecycle

`pending → processing → completed`

Failure path:

`processing → failed → retry → processing`

## 16.2 Publishing Lifecycle

`not_eligible → scheduled → publishing → published`

Failure path:

`publishing → failed → retry → publishing`

Other possible states:
- `held`
- `cancelled`
- `skipped`

## 16.3 Testing Mode Lifecycle

Testing-mode content should follow:

`pending → processing → completed → gallery_only`

It must never enter a real publishing worker.

## 16.4 Live Mode Lifecycle

Live-mode content should follow:

`pending → processing → completed → validated → scheduled → publishing → published`

The system must check eligibility again immediately before publishing.

# 17. Reliability and Safety Rules

The following are required engineering safeguards.

## 17.1 No Accidental Test Publishing

The publishing service must check:
- Current automation mode.
- Content generation mode.
- Publishing eligibility.
- Platform connection.
- Schedule validity.

A UI-only testing switch is insufficient.

## 17.2 Idempotency

Generation and publishing operations must be idempotent.

Retries must not:
- Generate duplicate weekly content unintentionally.
- Create duplicate platform posts.
- Create multiple schedules for the same publishing slot.
- Advance the property rotation multiple times for one logical job.

Use unique job identifiers, database constraints, and atomic updates.

## 17.3 Concurrency

Only one worker should claim a given generation or publishing job at a time.

Use database locking or atomic job claiming.

## 17.4 Credential Security

- Store social credentials securely.
- Never expose access tokens in client-side responses.
- Validate account ownership and business access.
- Handle expired or revoked platform tokens.
- Keep test and production publishing behavior isolated.

## 17.5 Platform Validation

Before publishing:
- Validate media type.
- Validate file size and format.
- Validate video duration.
- Validate image dimensions.
- Validate captions and metadata.
- Confirm that the connected platform supports the intended content type.

Actual platform API requirements must be verified during implementation.

## 17.6 Failure Isolation

A failure on Instagram must not necessarily block Facebook or TikTok.

The shared creative can be reused while each platform publishing attempt is tracked independently.

Likewise, a LinkedIn generation failure must not stop social content generation.

# 18. User Interface Requirements

The UI should focus on automation visibility rather than manual content creation.

## 18.1 Dashboard

Show:
- Automation mode.
- Automation running/paused status.
- Social weekly frequency.
- LinkedIn weekly frequency.
- Active property count.
- Current generation cycle.
- Upcoming scheduled content.
- Recently generated content.
- Publishing failures.
- Recent performance.

## 18.2 Property Listings

Show:
- Property image.
- Property name.
- Location.
- Space category.
- Active/inactive status.
- Last promotional date.
- Video usage count.
- Next planned promotion.

Individual property pages should show:
- Property details.
- Reference images.
- Supported event types.
- Content history.
- Promotion history.
- Current rotation status.
- Activation controls.

## 18.3 Automation Settings

Keep settings minimal:

- Social posting frequency.
- LinkedIn posting frequency.
- Testing or Live mode.
- Automation enabled or paused.
- Connected social accounts.

The user should not need to configure individual post dates, scripts, captions, video formats, or property selections.

## 18.4 Content Gallery

Provide the full generated-content history and upcoming schedule.

The gallery should make the distinction between:
- Generated.
- Gallery-only.
- Scheduled.
- Published.
- Failed.

## 18.5 No Manual Content Creation Workflow

Do not make individual content forms the primary workflow.

The AI generates content from property information and automation settings.

The gallery is for viewing, inspecting, comparing, and regenerating AI output—not for manually composing every post.

# 19. Automation Execution Strategy

The system should use background jobs rather than long-running frontend requests.

Recommended job types:

- `start_weekly_cycle`
- `calculate_content_targets`
- `select_next_property`
- `generate_social_script`
- `generate_linkedin_content`
- `select_video_format`
- `generate_video_30s`
- `generate_video_clip_20s`
- `combine_video_clips`
- `generate_image`
- `validate_generated_content`
- `generate_weekly_schedule`
- `save_gallery_content`
- `create_platform_publish_jobs`
- `publish_social_post`
- `publish_linkedin_post`
- `collect_content_performance`

The exact implementation may use the existing background-job infrastructure if it is reliable and already integrated.

Each job must have:
- Unique ID.
- Input parameters.
- Status.
- Retry policy.
- Timeout.
- Error information.
- Idempotency key.

Generation jobs and publishing jobs must remain separate.

# 20. Recommended Implementation Phases

## Phase 1 — Inventory and Foundation

- Inspect the current Kinetix codebase.
- Verify the existing database schema.
- Identify reusable media and social-post infrastructure.
- Remove outreach functionality after dependency analysis.
- Import the existing property inventory.
- Implement property records and property management.
- Associate historical content with properties where possible.

**Deliverable:** Kangrooo property inventory and foundational database.

## Phase 2 — Automation Settings and Testing Mode

- Implement the two frequency settings.
- Implement Testing and Live modes.
- Implement automation pause/resume.
- Add backend mode enforcement.
- Build the content gallery.
- Ensure generated content can be saved without publishing.

**Deliverable:** Safe gallery-only content generation environment.

## Phase 3 — AI Content Generation

- Implement the property rotation manager.
- Implement the social content agent.
- Implement the LinkedIn content agent.
- Implement script generation.
- Implement 30-second video generation.
- Implement two-part 20-second video generation.
- Implement image generation.
- Implement content validation.
- Add content revisions and regeneration.

**Deliverable:** End-to-end AI content generation in Testing Mode.

## Phase 4 — Weekly Orchestration and Scheduling

- Implement weekly generation cycles.
- Calculate content targets from configured frequencies.
- Select properties.
- Generate content ahead of publication.
- Implement AI scheduling.
- Handle timezones.
- Prevent duplicate weekly cycles.
- Display the upcoming week's content.

**Deliverable:** Complete upcoming-week content queue in the gallery.

## Phase 5 — Social Media Publishing

- Integrate TikTok publishing.
- Integrate Instagram publishing.
- Integrate Facebook publishing.
- Integrate LinkedIn publishing.
- Implement platform-specific validation.
- Implement independent platform publishing jobs.
- Implement retry and failure handling.
- Enforce live-mode eligibility.

**Deliverable:** Automatic publishing in Live Mode.

## Phase 6 — Analytics and Optimization

- Collect supported performance metrics.
- Associate metrics with properties and content.
- Evaluate content performance.
- Improve future scheduling.
- Improve content themes based on observed engagement.
- Track property promotion coverage.

**Deliverable:** Performance-informed content automation.

# 21. Testing Strategy and Acceptance Criteria

## 21.1 Testing Mode

- A weekly cycle generates the expected number of social and LinkedIn assets.
- Social content uses one creative for all three social platforms.
- LinkedIn generates text + image only.
- The AI selects the correct video-generation format.
- Two 20-second clips combine into one final video.
- All completed assets appear in the gallery.
- No publishing jobs are dispatched.
- No real social accounts receive test content.
- Regeneration creates a new revision.
- Failed jobs can retry without duplicating successful output.

## 21.2 Property Rotation

- Active properties are selected sequentially.
- Inactive properties are skipped.
- New properties are appended.
- Existing rotation does not reset when a property is added.
- Historical usage is retained.
- Repeated selection is prevented where eligible alternatives remain.

## 21.3 Scheduling

- Social frequency is respected.
- LinkedIn frequency is respected.
- AI selects days and times.
- Timezone is stored correctly.
- Scheduling avoids unnecessary clustering.
- Incomplete generation is visible.
- Failed generation does not cancel the entire weekly cycle.

## 21.4 Live Publishing

- Only live-mode content is eligible.
- Only validated content is published.
- Social content is sent to TikTok, Instagram, and Facebook.
- LinkedIn receives only text + image content.
- A platform failure does not corrupt the other platform records.
- Retries do not create duplicates.
- Published content appears in the gallery with platform references and timestamps.

## 21.5 Mode Switching

- Switching from Testing to Live does not publish old test content.
- New live cycles create eligible publishing jobs.
- Pausing automation prevents new publishing actions.
- Resuming automation does not duplicate jobs.

# 22. Important Product Boundaries

The following are not part of the initial scope unless explicitly added later:

- Manual approval of every generated post.
- Manual selection of posting days.
- Manual selection of posting times.
- Manual selection of a property for every post.
- Separate creative generation for TikTok, Instagram, and Facebook.
- LinkedIn video publishing.
- Automatic publishing of historical test content.
- Blog generation as a required part of the new automation.
- Manual content composition as the primary workflow.

The historical blog fields in the supplied inventory can be retained for data compatibility, but blog automation is not part of the currently defined social content pipelines.

> **Status:** a display-only blog pipeline was added anyway. It generates articles with images into the gallery, has its own weekly frequency and rotation, and never publishes. Posts leave the gallery only via "Copy Markdown". See `architecture/content_automation.md` §11.

# 23. Open Technical Decisions

These decisions require implementation research or product confirmation before being treated as fixed requirements:

1. **Platform API capabilities:** Verify current publishing permissions and media requirements for all four platforms, including account types and authorization requirements.
2. **Exact weekly generation trigger:** Choose the day and time for generating the following week's content.
3. **Frequency limits:** Define the permitted minimum and maximum weekly frequencies.
4. **Property rotation granularity:** Decide whether social and LinkedIn pipelines share one rotation cursor or maintain independent cursors. Recommended initial behavior: one shared promotion history with pipeline-aware fairness.
5. **Property eligibility:** Define how missing images, incomplete listing information, or previously promoted properties affect eligibility.
6. **Publishing failures:** Define whether failed posts are retried at the same time, moved to another slot, or held for the next cycle.
7. **Mode switching:** Define whether changing to Testing Mode immediately holds already scheduled live posts.
8. **Analytics availability:** Verify which metrics can be collected from each platform.
9. **AI scheduling model:** Choose the initial heuristic and later performance-learning approach.
10. **Video generation provider:** Confirm the provider's actual ability to generate the required durations and the expected method for combining clips.

These decisions must not be silently assumed to be implemented features.

# 24. Final Definition of Done

The Kangrooo content automation system is considered functionally complete when:

- All active property listings are available to the rotation system.
- The user can configure exactly two weekly posting frequencies.
- TikTok, Instagram, and Facebook share one creative pipeline.
- LinkedIn uses an independent professional text + image pipeline.
- The AI selects 30-second or 40-second video generation based on the script.
- The AI selects publishing days and times.
- The following week's content is generated in advance.
- All generated content is visible in the gallery.
- Testing Mode never publishes to connected social accounts.
- Live Mode automatically publishes eligible content.
- Historical test content cannot accidentally enter live publishing.
- Property promotion history is maintained.
- Generation and publishing failures are recoverable.
- Duplicate content generation and duplicate publishing are prevented.
- The system records enough information to improve future content and scheduling decisions.

---

# 25. Product North Star

**The user configures the frequency. Kangrooo's AI decides what to promote, how to create it, when to publish it, and where to distribute it.**

During testing, the AI generates everything into a private gallery.

In production, the same automation generates, schedules, and publishes content automatically.

There should be no requirement for users to manually create or approve every post.
