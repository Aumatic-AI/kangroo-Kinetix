import type { SupabaseClient } from "@supabase/supabase-js";

/** media_asset id → { url, type }, from the public URL stored in metadata at generation time. */
export async function loadMedia(supabase: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, { url: string | null; type: "image" | "video" | null }>> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  const map = new Map<string, { url: string | null; type: "image" | "video" | null }>();
  if (!unique.length) return map;
  const { data, error } = await supabase.from("media_assets").select("id, type, metadata").in("id", unique);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    map.set(r.id, { url: (r.metadata as { publicUrl?: string } | null)?.publicUrl ?? null, type: r.type === "video" ? "video" : r.type === "image" ? "image" : null });
  }
  return map;
}
