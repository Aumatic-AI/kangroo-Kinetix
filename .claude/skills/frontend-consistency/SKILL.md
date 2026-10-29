---
description: Build or edit any UI in Kinetix — a page, a modal, a table, a new component. Use whenever the task touches src/components/, src/modules/*/pages/, src/modules/*/components/, or anything rendering JSX/Tailwind classes.
---

# Building UI consistently

`DESIGN.md` (root of the repo) is already loaded into context via `CLAUDE.md`'s `@DESIGN.md` import — it has the actual tokens, component specs, and rules. This skill is the workflow for applying it; don't restate its content here, read it there.

Follow these steps, in order, before writing new UI markup:

1. **Check `src/components/ui/` for an existing component first.** Button, Input, Textarea, Select, Table, Dialog, Drawer, DropdownMenu, ConfirmModal, Avatar, Loader, Skeleton, Tabs, SplashScreen, Stepper, DateTimePicker all already exist with a defined spec (`DESIGN.md` §7). Reuse one of these before writing a one-off styled `<div>` — a duplicated, slightly-different button/table/modal is the most common way this app's UI has drifted in the past.
2. **Never use `src/components/ui/card.tsx`.** It has zero real consumers — it's dead scaffolding. For a bordered panel or table wrapper, use the actual established idiom: `<div className="border border-default rounded-lg overflow-hidden">` (or `rounded-2xl border-dashed` for an empty state).
3. **For any color, radius, shadow, spacing, or icon size, use a token/class from `DESIGN.md` §2–§5** — never a raw hex code, an arbitrary `rounded-[Npx]`, or a guessed pixel value. If the exact value isn't covered, use the closest existing one and say so, rather than inventing a new one silently.
4. **Reusable action confirmations (delete/pause/resume/send/anything irreversible) go through `ConfirmModal`**, not a new one-off `window.confirm` or bespoke dialog — see its prop shape in `DESIGN.md` §7.
5. **New shared component → `src/components/ui/`, PascalCase filename** (e.g. `Avatar.tsx`, not `avatar.tsx`). Existing kebab-case files in that folder (`table.tsx`, `dialog.tsx`, etc.) are pre-existing shadcn-scaffolded files — leave their names alone, don't rename them as part of an unrelated change.
6. **Before changing an existing component's padding/size/radius "because it looks better,"** check `DESIGN.md` §7 for that component's actual spec first — a visual tweak that isn't in the spec either belongs in the spec (update `DESIGN.md` too) or isn't the right fix.
7. **If a Tailwind class visually has no effect**, check `globals.css` for a competing hand-written unlayered utility before assuming a typo — see `CLAUDE.md`'s "Styling" section and `DESIGN.md` §4 for the exact cascade-layer gotcha (this has been the root cause several times, most often with `rounded-*` classes).
8. **One primary-colored `Button` per view/section.** A second important action is `outline`, not a second `primary` — don't add visual competition for the one thing the screen wants the user to do.
