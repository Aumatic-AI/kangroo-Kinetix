# Design System — Single Source of Truth

> This file describes the UI system **as it actually exists in the code today**, verified directly against `src/styles/globals.css` and every file in `src/components/ui/` — not an aspirational target. If a rule here conflicts with something in the codebase, that's a real inconsistency to flag and fix (see §9), not a sign this file is wrong.
>
> Never invent a color, radius, shadow, or icon size that isn't listed below. If a situation isn't covered, reuse the closest existing token/component and note the assumption — don't invent a new one silently.

Theme: **light only**. There is no `.dark` block anywhere in `globals.css`. Do not add dark-mode variants.

---

## 1. Principles

1. **One accent, used with intent.** `--color-primary` means "the one thing to do here" — one primary `Button` per view/section. Everything else is neutral or `outline`/`ghost`.
2. **Neutral does the heavy lifting.** Most of the UI is white/surface/border/muted-text. Color signals meaning (primary action, danger, success) — it isn't decoration.
3. **Reuse `src/components/ui/`, don't reinvent.** Every shared control already has a component. Building a one-off styled `<div>` that duplicates `Button`, `Table`, `Input`, etc. is the #1 source of visual drift in this codebase — check §7 before writing new markup for something that looks like a button, card, table, or modal.
4. **Flat surfaces get a border, not a shadow.** Cards, tables, panels: `border border-default`. Shadows are reserved for things that float above content (`Dialog`, `Drawer`, `DropdownMenu`, `Popover`).
5. **Density over decoration.** This is a calm, information-dense SaaS product UI, not a marketing site. No gradients, no glassmorphism, no oversized hero-style components inside the app shell.

---

## 2. Color Tokens

All defined in `src/styles/globals.css` under `:root` (there is no separate dark-theme block). Reference them via the existing Tailwind utility classes (`bg-primary`, `text-danger`, `border-default`, …) — never a raw hex code in a component.

### Primary
| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#7132f5` | Primary buttons, links, focus rings, active/selected state |
| `--color-primary-hover` | `#5741d8` | Hover state of primary elements |
| `--color-primary-active` | `#5b1ecf` | Pressed state |
| `--color-primary-subtle` | `rgba(133, 91, 251, 0.16)` | Light tint background (selected row, active nav item) |
| `--color-primary-border` | `#5741d8` | Border on primary-subtle surfaces |

### Neutral
| Token | Value | Usage |
|---|---|---|
| `--color-background` | `#ffffff` | App background, card/panel background |
| `--color-surface` | `rgba(148, 151, 169, 0.08)` | Page background behind panels, table header bg, hover bg |
| `--color-secondary` | `rgba(148, 151, 169, 0.08)` | Secondary button bg, `Avatar` bg — identical value to `--color-surface` today |
| `--color-secondary-hover` | `rgba(148, 151, 169, 0.16)` | Hover on secondary/ghost elements |
| `--color-border` | `#dedee5` | All borders — panels, inputs, dividers, table rows |
| `--color-text` | `#101114` | Headings, primary body text |
| `--color-text-muted` | `#686b82` | Secondary text, labels, captions, `Avatar` icon color |
| `--color-text-secondary` / `--color-text-disabled` | `#9497a9` | Same value today — tertiary text / disabled text |

### Semantic
| Token | Value (base / bg / border) | Usage |
|---|---|---|
| `--color-danger` | `#ef4444` / `#fef2f2` / `#fecaca` | Destructive actions, error text/border, `Trash2` icon buttons |
| `--color-success` | `#149e61` / `rgba(20,158,97,0.16)` / `#149e61` | Success states, "Sent"/healthy status pills |
| `--color-warning` | `#f59e0b` / `#fffbeb` / `#fde68a` | Warning states, "No Recipients" status pills |
| `--color-info` | `#3b82f6` / `#eff6ff` | Informational banners — distinct from primary (primary = action, info = message) |

**Rule:** if a component needs a color not on this list, that's a signal to stop and add it here first, not invent one inline.

---

## 3. Typography

**Font: Geist** (`next/font/google`, loaded and applied in `src/app/layout.tsx` as the `--font-sans` CSS variable on `<html>`). There is exactly one font family — no separate display/heading font.

> `globals.css` also declares `--font-sans: 'Kraken-Product', 'IBM Plex Sans', …` and a `--font-display: 'Kraken-Brand', …` inside `:root`, left over from an earlier "Kraken-inspired" design pass. Neither font file is actually loaded anywhere and `--font-display` isn't wired into `@theme` at all — Geist is what really renders. Don't reference "Kraken-Product"/"Kraken-Brand" as if they're real fonts in this app.

| Class | Size / line-height | Typical usage |
|---|---|---|
| `text-xs` | 12px / 16px | Captions, table meta, micro-labels (`uppercase tracking-wide`) |
| `text-sm` | 14px / 20px | Body text, labels, button text, table cells |
| `text-base` | 16px / 24px | Default body copy, form values |
| `text-lg` | 18px / 28px | Card/section/dialog titles (`font-semibold`) |
| `text-xl` | 20px / 28px | Larger section headings |
| `text-2xl` | 24px / 32px | Page titles (`font-bold`), always paired with a `text-sm text-muted` description directly below |
| `text-3xl` | 30px / 36px (hardcoded, not a CSS variable — a minor existing inconsistency) | Rare — big dashboard numbers only |

**Rules:** page title is `text-2xl font-bold` + `text-sm text-muted` subtitle. Card/panel headers are `text-lg font-semibold`. Body/UI text is 400 weight by default; use 500 (`font-medium`) for labels and emphasis, 600 (`font-semibold`)/700 (`font-bold`) only for titles.

---

## 4. Radius & Elevation

### Radius — read this before using any `rounded-*` class
Two radius scales coexist in `globals.css`, and **the hand-written one always wins** (see the cascade-layer gotcha in `CLAUDE.md`'s "Styling" section — hand-written, unlayered CSS beats Tailwind's generated utilities regardless of source order). The values below are the ones that actually render:

| Class | Effective value | Usage |
|---|---|---|
| `.rounded-sm` (`--radius-sm`) | 6px | Badges, small tags |
| `.rounded-md` (`--radius-md`) | 8px | Dropdown/menu items |
| `.rounded-lg` (`--radius-lg`) | **12px** | Buttons, inputs, panels, dialogs, drawers, dropdown panels — the default radius for almost everything |
| `.rounded-full` | 9999px | Status dots only — **not** `Avatar` (see §7) |

Tailwind's own `@theme inline`-generated `rounded-lg` would compute to 10px (`var(--radius)`, a separate shadcn-style rem scale also present in the file) — that value never actually applies because the hand-written unlayered `.rounded-lg` rule always overrides it. If a change to `globals.css` ever removes the hand-written utility block, every `rounded-lg` in the app would silently shift from 12px to 10px — worth knowing before "cleaning up" that file.

### Shadow
| Token | Value | Usage |
|---|---|---|
| `--shadow-sm` | `rgba(16, 24, 40, 0.04) 0px 1px 4px` | Rarely used — most flat surfaces use a border instead |
| `--shadow-md` | `rgba(0, 0, 0, 0.03) 0px 4px 24px` | `Dialog`, `DropdownMenu`, `Popover` |
| `--shadow-lg` | `0 10px 25px -5px rgb(0 0 0 / 0.15)` | `Drawer` |

**Rule:** flat surfaces (tables, panels, page sections) get `border border-default`, not a shadow. Shadows are for things that float above content.

---

## 5. Iconography

- **Library: `lucide-react` only** — used consistently across the whole app (68+ files). Never mix icon sets.
- **Sizing** (observed convention, not a strictly enforced system today — codify it going forward): `w-4 h-4` / `size-4` (16px) is the default for buttons, inputs, and table row actions. `w-3.5 h-3.5` (14px) for smaller inline labels and dense row actions (e.g. `LeadsTable`'s row icons).
- **Stroke width:** lucide's own default (`2`) — there's no global override. Don't add one for a single component.
- Icons are never the sole control without a text label or a `title`/tooltip attribute (see the preview button in `CampaignPickCreativeDialog.tsx` for the pattern: `<button title="Preview"><Play className="w-3.5 h-3.5" /></button>`). On pages with real room (the Campaign/Ad Set/Ad detail pages), prefer a plain text label over an icon-only button — see `StatusActions.tsx`'s Pause/Resume/Archive buttons.

---

## 6. Layout

Two-tier sidebar, driven by CSS variables in `globals.css` (`--sidebar-primary-width: 64px`, `--sidebar-secondary-width: 240px`, `--navbar-height: 56px`), matching `CLAUDE.md`'s architecture description:

```
┌──────────────────────────────────────────────────────────────────┐
│ Navbar — 56px, border-b, spans full width                        │
├────────┬───────────────┬──────────────────────────────────────────┤
│ Primary│  Secondary    │                                          │
│Sidebar │  Sidebar      │            Page content                 │
│ 64px   │  240px        │   (max-w-4xl for list/table pages,       │
│ icon   │  per-module   │    max-w-5xl+ for wider detail layouts,  │
│ only,  │  tab list,    │    max-w-2xl for narrow forms)           │
│ fixed  │  always       │                                          │
│        │  visible      │                                          │
└────────┴───────────────┴──────────────────────────────────────────┘
```

- `PrimarySidebar` = one icon per top-level module (`PRIMARY_NAV_ITEMS` in `src/config/navigation.ts`). `SecondarySidebar` = the active module's tabs (`SECONDARY_NAV_ITEMS`), shown/hidden by the URL's pathname prefix — see `src/app/(app)/layout.tsx`.
- Standard page template (used by every module page): title (`text-2xl font-bold`) + description (`text-sm text-muted`) on the left, a single primary-colored action button top-right, `space-y-6` before content starts. See `CampaignsPage.tsx`/`LeadsPage.tsx` for the reference shape.
- Empty states: centered text inside a `border border-dashed rounded-2xl` panel, a one-line `text-sm text-muted` message, optional small primary action below it.

---

## 7. Component Specifications

Everything below is in `src/components/ui/`. **Check this list before writing new markup that looks like one of these** — if it needs a new variant, add it here and to the component, don't build a parallel one-off.

### Button (`Button.tsx`)
- Variants: `primary` (default) · `secondary` · `outline` · `ghost` · `destructive` · `white`. Exactly these six — no ad-hoc variants.
- Sizes: `sm` (32px, `h-8`) · `default` (46px) · `lg` (48px, `h-12`) · `icon` (46×46px square).
- Radius `rounded-lg` (12px, see §4). Icon size auto-forced to 16px via `[&_svg]:size-4` on any icon passed in.
- `loading` prop swaps the label for a built-in spinner and keeps width stable; `asChild` (via `@radix-ui/react-slot`) lets a `Button`-styled element render as something else (e.g. a `Link`).

### Input / Textarea / Select (`Input.tsx`, `textarea.tsx`, `select.tsx`)
- All share a **fixed 46px height** (Textarea: `min-h-[120px]`), `rounded-lg`, `border border-border`, focus ring `ring-2 ring-primary/20` + `border-primary`.
- `Input` has a built-in `error` prop (switches border/ring to danger) and a built-in password-visibility toggle (`isPassword`, `Eye`/`EyeOff` at `size={16}`).
- `Select` (built on `@radix-ui/react-select`): trigger 46px, items 40px, `rounded-lg` panel, min-width 180px.
- Label always sits above the field (`text-sm font-medium`), helper/error text below (`text-xs`).

### Table (`table.tsx`)
- Plain `<table>`, **no `table-fixed`** — columns size naturally by content. Don't add a fixed `w-*` class to a `TableHead`/`TableCell` unless a column genuinely needs constraining (this was an explicit fix made this session: removing fixed widths so long content grows its own column instead of truncating).
- Header: `bg-surface`, `text-xs font-medium text-muted uppercase`, 40px (`h-10`). Rows: 48px (`h-12`), `border-b` only — no vertical borders, no zebra striping. Cell padding `px-4`.
- Row actions: plain icon `<button>`s (e.g. `Pencil`, `Trash2`) directly in the last cell, right-aligned with `flex justify-end gap-2` — **not** a `DropdownMenu`/kebab menu (removed from `LeadsPage.tsx` this session in favor of direct icon buttons).
- Always wrap in `<div className="border border-default rounded-lg overflow-hidden">` — the table component itself has no outer border.

### Dialog (`dialog.tsx`) — built on `@base-ui/react/dialog`
- Fixed `max-w-[480px]`, centered, `rounded-lg`, `shadow-md`, `p-6`. Overlay `bg-black/40`, no blur.
- `DialogDescription` renders a `<p>` — for richer block-level content inside a dialog, don't nest it there (invalid HTML); use a sibling element instead (see `ConfirmModal`'s separate `details` slot).

### Drawer (`drawer.tsx`) — built on `@base-ui/react/drawer`
- Use instead of `Dialog` for longer content that needs more vertical room (e.g. a list of records). Slides in from a configurable `swipeDirection`.
- Width is overridable per-instance via the CSS variable `--drawer-content-width` on `DrawerContent` (e.g. `className="data-[swipe-axis=x]:sm:[--drawer-content-width:800px]"` — the pattern used by `LeadsDrawer.tsx`). Don't hardcode a different width mechanism.
- `shadow-lg`, same internal padding/title conventions as `Dialog`.

### DropdownMenu (`dropdown-menu.tsx`) — built on `@base-ui/react/menu`
- Min-width 180px, `rounded-lg`, `shadow-md`, items 36px (`h-9`). Destructive items: `text-danger`.
- Prefer direct icon buttons over a dropdown for 1-2 row actions (see Table above) — reach for `DropdownMenu` only when there are genuinely 3+ actions that would otherwise clutter a row.

### ConfirmModal (`ConfirmModal.tsx`)
- The standard pattern for **every** destructive or state-changing action (delete, pause, resume, send) — built this session specifically so these don't get reinvented per-feature.
- Controlled `open`/`onOpenChange`, `title`, `description` (plain string, rendered in `DialogDescription`), optional `details` (`ReactNode`, for block-level content like a `<dl>` summary — see the Send confirmation in `CampaignsPage.tsx`), `confirmLabel`, `variant` (`primary` | `destructive`), `loading` (disables Cancel, shows a spinner, blocks dismissal), `error` (inline message, keeps the dialog open on failure so the user can retry).
- Use `.mutateAsync()` and only close the modal after the promise resolves — don't close optimistically before the mutation settles.

### Avatar (`Avatar.tsx`)
- The shared icon-or-letter avatar, built this session. Accepts an optional `icon` (`LucideIcon`) or falls back to the first letter of `label`.
- **Fixed style: `w-9 h-9 rounded-lg bg-secondary border border-default text-muted`** — neutral, not primary-colored, and `rounded-lg` (**not** `rounded-full`) per explicit product direction. Don't reintroduce a circular or primary-tinted avatar.
- Use letter-fallback mode for per-record rows where each item has a distinguishing name (e.g. a lead's initial in `LeadsTable`); use a single fixed icon (not a per-row guessed icon) when every row in a table represents the same kind of thing (e.g. every row in the Leads-lists table uses the same `Users` icon, every row in the Campaigns table uses the same `Megaphone` icon) — a per-row keyword-guessed icon was tried and explicitly reverted in favor of this simpler, more consistent rule.

### Breadcrumb (`breadcrumb.tsx`) — shadcn-scaffolded, built on `@base-ui/react/use-render`
- Added for the Meta Ads Campaign/Ad Set/Ad detail pages, which replaced a single "← Back" button — since those three pages share one layout, the breadcrumb (`Campaigns / {campaign} / {ad set} / {ad}`) is what tells you which one you're actually on and lets you jump back to any ancestor level directly, not just one step back.
- `BreadcrumbLink` renders an `<a>` by default; pass Next's `Link` via the `render` prop for real client-side navigation — `<BreadcrumbLink render={<Link href={...} />}>` (see `CampaignDetailPage.tsx`). The current page is `BreadcrumbPage` (plain text, not a link).
- Uses shadcn's default `text-foreground`/`text-muted-foreground` classes as-is — unlike some other shadcn scaffolding in this repo, those *do* resolve correctly here (`globals.css` aliases `--foreground`/`--muted-foreground` straight to `--color-text`/`--color-text-muted`), so no manual token fixup was needed.

### LevelChip (`campaigns/shared.tsx`)
- A small neutral pill ("Campaign" / "Ad Set" / "Ad") shown next to the title on each of the three detail pages — `bg-secondary text-muted border-border`, deliberately not colored, so it's never confused with `StatusChip` (which is always semantic-colored). Exists because those three pages are visually identical enough that a quick glance needs to confirm which level you're on, alongside the breadcrumb.

### Loader (`Loader.tsx`) / Skeleton (`skeleton.tsx`)
- `Loader`: one spinner style app-wide (primary stroke, border-color track), sizes `sm` 16px / `md` 24px / `lg` 32px. Never mix in a second spinner style.
- `Skeleton`: `bg-secondary`, calm 1.5s pulse (no shimmer sweep). Shape it to mirror the real content (a text-line skeleton is a thin rounded bar, a row skeleton is the row's real height) so layout doesn't jump on load.

### Tabs (`tabs.tsx`) — built on `@base-ui/react/tabs`
- Default is underline style: inactive `text-muted`, active `text-text font-semibold border-primary` (2px bottom border). Don't introduce a segmented/pill tab style elsewhere without good reason — pick one pattern app-wide.
- **Known exception:** `LeadsPage.tsx`'s Leads/Instant Forms tabs override `TabsList`/`TabsTrigger` via `className` to render as a segmented pill control (`bg-surface rounded-lg p-1` container, active tab `bg-background shadow-sm`), matching the day-range buttons on the Reports page. This is a per-instance `className` override on the shared component, not a fork — `tabs.tsx` itself is unchanged, and `AdLibrary.tsx`/`CreateAdModal.tsx` still use the default underline style.

### Stepper (`stepper.tsx`)
- Reached-step circle and connector line use `bg-info` (not `bg-primary`, not black) — a deliberate choice so the step indicator reads as its own UI chrome without competing with the page's one primary action button.

### DateTimePicker (`date-time-picker.tsx`)
- Composes `Popover` + `Calendar` (`react-day-picker`) + a manual time input. Treat `Popover` and `Calendar` as **internal to `DateTimePicker`**, not general-purpose components to import directly elsewhere — nothing in the app currently uses them standalone.

### Do not use: `card.tsx`
`Card`/`CardHeader`/`CardTitle`/etc. in `src/components/ui/card.tsx` has **zero real consumers** anywhere in `src/` — it's unused shadcn-CLI scaffolding. The actual, real convention used everywhere for a bordered panel/table wrapper is a plain `<div className="border border-default rounded-lg overflow-hidden">` (or `rounded-2xl border-dashed` for an empty state) — use that, not `Card`. (A separate, unrelated `Card` exists at `src/modules/meta-ads/components/competitors/shared.tsx` — that one is real but scoped to the Competitors feature only, not part of the shared `ui/` layer.)

---

## 8. States

| State | Rule |
|---|---|
| Hover | Background shifts one step (e.g. `bg-background` → `bg-surface`). No size/shadow change except explicitly interactive cards. |
| Focus (keyboard) | Visible ring in `--color-primary` at reduced opacity — never `outline: none` without a replacement. |
| Disabled | Reduced opacity, `cursor: not-allowed`, no hover/focus effect. |
| Loading | The shared `Loader`/`Skeleton` — never a full-page white-out except `SplashScreen` on initial app load. |
| Error | `--color-danger` border/text, message directly below the field/action. |

---

## 9. Known inconsistencies (real, not hypothetical — worth fixing opportunistically, not urgent)

- `Input.tsx` imports its `cn` helper from `@/utils/cn`; every other file in `ui/` imports the same helper from `@/lib/utils`. Both implementations are identical (`clsx` + `twMerge`) — this is duplicated code, not a behavior difference, but a real drift worth consolidating on `@/lib/utils` next time `Input.tsx` is touched.
- `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, and `@radix-ui/react-tooltip` are listed in `package.json` but have no real consumers in `src/` (the `ui/` layer migrated to `@base-ui/react` for these) — one ad-hoc exception (`VoiceExplorerModal.tsx`) imports `@radix-ui/react-dialog` directly instead of the shared `dialog.tsx`. Treat this as legacy debt, not a second valid pattern to copy.
- `src/components/ui/card.tsx` is dead (see §7) — a candidate for deletion whenever someone is already touching that area, not urgent on its own.

---

## 10. Rules for the AI Agent (read before generating or editing any component)

1. **Reuse `src/components/ui/` first.** Never create a new one-off styled `<div>` that duplicates `Button`, `Table`, `Input`, `Avatar`, etc. If a genuinely new variant is needed, add it to the real component and document it in §7 — don't style around it inline.
2. **Never use `ui/card.tsx`.** Use the `border border-default rounded-lg` panel idiom (§7) instead.
3. **Never introduce a color, radius, or shadow value outside §2/§4.** No raw hex, no arbitrary `rounded-[Npx]`. If unsure, use the closest existing token.
4. **Remember the radius cascade gotcha (§4)** — `rounded-lg` renders at 12px because of a hand-written override, not Tailwind's computed 10px. If a Tailwind class visually "does nothing," check for a competing unlayered rule in `globals.css` before assuming a typo (see `CLAUDE.md`'s Styling section for the general version of this gotcha).
5. **One primary-colored `Button` per view/section.** A second important action is `outline`, not a second `primary`.
6. **Icons: `lucide-react` only**, 16px (`w-4 h-4`/`size-4`) default, 14px (`w-3.5 h-3.5`) for dense inline contexts (§5). Never mix icon libraries.
7. **`Avatar` is neutral and `rounded-lg`** — never primary-colored, never `rounded-full` (§7).
8. **New shared components go in `src/components/ui/` with a PascalCase filename** (`Avatar.tsx`, `ConfirmModal.tsx` — the convention established this session). Existing kebab-case shadcn-scaffolded files (`table.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, …) stay as-is — don't rename them, that's pure churn.
9. **No dark mode.** Do not add `.dark` classes or dark backgrounds anywhere.
10. **If a requirement isn't covered here, pick the closest existing token/component and say so explicitly** — don't invent a new pattern silently.
