import { SupabaseClient } from "@supabase/supabase-js";

/** Single-tenant app: "the business" is the first (only) row in `businesses`. */
export async function getFirstBusinessId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("businesses").select("id").limit(1).single();
  if (error && error.code !== "PGRST116") throw new Error(`Error fetching first business: ${error.message}`);
  return data?.id || null;
}
