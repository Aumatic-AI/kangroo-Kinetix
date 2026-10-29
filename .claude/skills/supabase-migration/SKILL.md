---
description: Write and apply a Supabase database migration for Kinetix, then regenerate types and verify. Use whenever a schema change is needed — new table, new column, altered constraint, enum change.
---

# Supabase migration workflow

Follow these steps in order. Don't skip the type-regeneration or verification steps — a migration without matching types silently leaves the rest of the codebase out of sync.

1. **Check the latest migration timestamp** first: `ls supabase/migrations/` (or Glob `supabase/migrations/*.sql`). New migration filenames must sort after the latest existing one — use `date +%Y%m%d%H%M%S` or increment the last timestamp by hand.
2. **Write the migration** as an additive change (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, new `CREATE TABLE`, etc.) unless the user explicitly asks for something destructive. Prefer renames/alters over drop-and-recreate so existing data survives.
3. **Push it**: `npx supabase db push --linked`. This prompts for confirmation before applying to the linked project — that's expected.
4. **Regenerate types**:
   ```bash
   npx supabase gen types typescript --project-id <YOUR_PROJECT_REF> --schema public > src/types/supabase.ts
   ```
   Never append `2>&1` to that command — a CLI update-notice on stderr gets written into the file after `} as const` and breaks every consumer with a wall of `tsc` errors that look unrelated to the actual change.
5. **Verify the new/changed column or table** actually appears: `grep` for the exact column/table name in `src/types/supabase.ts`.
6. **Run `npx tsc --noEmit`** across the whole project and fix anything the schema change surfaced before considering the migration done.
