# Listings Module

**Status: built (UI + API). Data arrives via the inventory import; the underlying schema is described in [`../architecture/content_automation.md`](../architecture/content_automation.md) and is applied to the Supabase project.**

## What it is
A top-level module (`/listings`, one flat page like Settings — no secondary sidebar) showing the property inventory the content automation rotates through. It is **read-mostly**: listings come from the inventory import (`scripts/inventory-import/`), not from a create form.

## The page
- **Table** (10 per page, server-paginated): thumbnail, name with city beneath, category, status pill, last promoted ("Never" until content has been generated). Search by name/city/category; filter by status and category.
- **Drawer on click** (same pattern as Outreach's leads drawer):
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
| API | `GET /api/listings` (list), `GET/PATCH /api/listings/[id]` (detail, activate/deactivate) |
| Nav | `PRIMARY_NAV_ITEMS` ("Listings"), `MODULES.listings`, `SECONDARY_NAV_ITEMS.listings = []` |

All reads and the status update run on the signed-in user's session, so RLS scopes them to their business; only editors and above can change a listing's status (a rejected update returns 403). `search` input is sanitised so it can only act as a plain substring in the PostgREST `or()` filter (`lib/listings.ts`, unit-tested in `scripts/tests/listings-lib.test.mjs`).

## Not included (yet)
"Next planned promotion" and "video usage count" from the spec — they depend on the weekly planner and video generation, which are not built.
