# Listings Module

**Status: built (UI + API). Data arrives via the inventory import; the underlying schema is described in [`../architecture/content_automation.md`](../architecture/content_automation.md) and is applied to the Supabase project.**

## What it is
A top-level module (`/listings`, one flat page like Settings — no secondary sidebar) showing the property inventory the content automation rotates through. It is **read-mostly**: the bulk of listings come from the inventory import (`scripts/inventory-import/`); an **Add listing** button covers one-off additions.

## The page
- **Table** (10 per page, server-paginated): thumbnail, name with city beneath, category, status pill, last promoted ("Never" until content has been generated). Search by name/city/category; filter by status and category.
- **Add listing** (header button → `AddListingDrawer`): name (required), category (suggests existing ones), city, supported events (comma-separated) and 1–5 photos (JPEG/PNG/WebP, ≤10 MB each; the first is the thumbnail). The browser uploads the photos straight to the `business_media` bucket under `<business_id>/listings/manual/<uuid>/`, which keeps them out of the API request and its host body-size limit. Then `POST /api/listings` creates the property (`source_key = manual:<uuid>`, `import_batch = manual`, active, location unverified) and its `property_images`. The new listing enters the rotation immediately. With zero promotions it ranks ahead of every listing already promoted; `rotation_seq` (assigned by the database, so after all existing listings) only orders it behind other never-promoted ones. Its detail drawer then opens. Photos are re-encoded to JPEG at generation time like imported ones.
- **Drawer on click**:
  - image gallery (all reference images, thumbnails to switch, graceful fallback for images that fail to load);
  - details: category, city, region/country/timezone (shown as "Not verified" until someone verifies them), location-check status, supported events;
  - rotation: position, last promoted, per-environment (Live / Testing) counts for promoted / social / LinkedIn / failed / published, and an **activate/deactivate switch** behind a `ConfirmModal`;
  - recent promotion history and content history.
- Deactivating excludes the listing from the rotation and stops its scheduled posts from being published; history is kept (see the architecture doc).

## Code
| Piece | Where |
|---|---|
| Page / components / hook / types / pure helpers | `src/modules/listings/` |
| Route | `src/app/(app)/listings/page.tsx` (`ROUTES.LISTINGS.ROOT`) |
| API | `GET /api/listings` (list), `POST /api/listings` (add), `GET/PATCH /api/listings/[id]` (detail, activate/deactivate) |
| Nav | `NAV_SECTIONS` → "Content" section → "Listings" (`src/config/navigation.ts`) |

All reads and the status update run on the signed-in user's session, so RLS scopes them to their business; only editors and above can add a listing or change its status (a rejected write returns 403). `search` input is sanitised so it can only act as a plain substring in the PostgREST `or()` filter (`lib/listings.ts`, unit-tested in `scripts/tests/listings-lib.test.mjs`, along with the create-body validator `parseNewListing`).

## Not included (yet)
- **Video usage count** (spec §18.2). Video generation exists now, but the table doesn't show a per-listing video count, and `property_promotion_stats` doesn't count videos separately (it has generated / social / LinkedIn / failed / published).
- **Next planned promotion.** The weekly planner (`planCycleWeek`) plans posting *times* before properties are assigned, and automatic weekly runs are off during testing, so there is no planned promotion per listing to show.
- **Location column.** The city appears under the listing name instead of in its own column.
