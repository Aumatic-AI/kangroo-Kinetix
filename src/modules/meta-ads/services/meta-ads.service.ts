import { SupabaseClient } from "@supabase/supabase-js";
import {
  MetaAdCreative,
  MetaAdCreativeListItem,
  MetaAdCreativePickerItem,
  CreativeFilters,
  PaginationOptions,
} from "../types/meta-ads.types";
import { rangeFor } from "@/lib/pagination";

/** Pulls the storage path back out of a `business_media` public URL (e.g.
 * `.../storage/v1/object/public/business_media/<businessId>/...`), or null
 * for anything else — an externally-hosted URL (Kie's CDN) has no path of
 * ours to delete. */
function extractBusinessMediaPath(url: string): string | null {
  const marker = "/business_media/";
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length);
}

export class MetaAdsService {
  // ==========================================
  // CREATIVES
  // ==========================================
  
  // Ad Library's grid is the only consumer of this list — it doesn't read
  // business_id/idea_prompt/ad_script/service/media_asset_id/
  // revision_history/video_style/audio_style/language/character_type/
  // voice_id, so only what's actually rendered (plus created_at, needed by
  // the polling schedule in src/lib/generation-polling.ts) is fetched. The
  // campaign creative picker (CampaignPickCreativeDialog) needs idea_prompt/
  // ad_script/service to pre-fill ad copy on pick, so it uses
  // getCreativesForPicker below instead of this one. getCreativeById
  // further below still selects "*" since editing/retry needs the full row.
  static async getCreatives(
    supabase: SupabaseClient,
    filters?: CreativeFilters,
    pagination?: PaginationOptions
  ): Promise<{ data: MetaAdCreativeListItem[]; total: number }> {
    let query = supabase.from("meta_ad_creatives").select("id, type, status, media_urls, duration, created_at, aspect_ratio, studio_session_id", { count: "exact" });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.type) {
      query = query.eq("type", filters.type);
    }
    if (filters?.search) {
      // Assuming we want to search in the idea prompt or status
      query = query.ilike("idea_prompt", `%${filters.search}%`);
    }

    query = query.order("created_at", { ascending: false });

    if (pagination) {
      const page = pagination.page || 1;
      const limit = pagination.limit || 50;
      const [from, to] = rangeFor(page, limit);
      query = query.range(from, to);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`Error fetching creatives: ${error.message}`);
    return { data: data || [], total: count || 0 };
  }

  /** Cheap `head: true` count-only queries (no rows returned) for the Ad
   * Library header's "N total · N failed" summary — independent of
   * whichever page is currently displayed. */
  static async getCreativeCounts(supabase: SupabaseClient): Promise<{ all: number; review: number; failed: number }> {
    const [all, review, failed] = await Promise.all([
      supabase.from("meta_ad_creatives").select("id", { count: "exact", head: true }),
      supabase.from("meta_ad_creatives").select("id", { count: "exact", head: true }).eq("status", "review"),
      supabase.from("meta_ad_creatives").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);
    if (all.error) throw new Error(`Error counting creatives: ${all.error.message}`);
    return { all: all.count || 0, review: review.count || 0, failed: failed.count || 0 };
  }

  /** Same list, but for the "pick a creative to launch" dialog — it needs
   * enough fields to pre-fill the ad-copy step (name/headline/primary
   * text) once a creative is picked, not just what's shown on the card. */
  static async getCreativesForPicker(supabase: SupabaseClient, filters?: CreativeFilters): Promise<MetaAdCreativePickerItem[]> {
    let query = supabase.from("meta_ad_creatives").select("id, type, status, media_urls, duration, idea_prompt, ad_script, service, aspect_ratio");

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.type) {
      query = query.eq("type", filters.type);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(`Error fetching creatives: ${error.message}`);
    return data || [];
  }

  static async getCreativeById(supabase: SupabaseClient, id: string): Promise<MetaAdCreative | null> {
    const { data, error } = await supabase
      .from("meta_ad_creatives")
      .select("*")
      .eq("id", id)
      .single();
    
    if (error && error.code !== 'PGRST116') throw new Error(`Error fetching creative: ${error.message}`);
    return data || null;
  }

  static async createCreative(supabase: SupabaseClient, data: Partial<MetaAdCreative>): Promise<MetaAdCreative> {
    const { data: creative, error } = await supabase
      .from("meta_ad_creatives")
      .insert(data)
      .select("*")
      .single();

    if (error) throw new Error(`Error creating creative: ${error.message}`);
    return creative;
  }

  static async updateCreative(supabase: SupabaseClient, id: string, data: Partial<MetaAdCreative>): Promise<void> {
    const { error } = await supabase
      .from("meta_ad_creatives")
      .update(data)
      .eq("id", id);

    if (error) throw new Error(`Error updating creative: ${error.message}`);
  }

  static async deleteCreative(supabase: SupabaseClient, id: string): Promise<void> {
    // Ad-generated images are hosted externally (Kie's own CDN) and have
    // nothing of ours to clean up, but stitched videos and direct uploads
    // land in our own `business_media` bucket — leaving those behind on
    // delete would silently leak storage forever.
    const { data: creative } = await supabase.from("meta_ad_creatives").select("media_urls").eq("id", id).single();
    const ownStoragePaths = ((creative?.media_urls as string[] | null) || [])
      .map(extractBusinessMediaPath)
      .filter((p): p is string => !!p);

    if (ownStoragePaths.length) {
      const { error: storageError } = await supabase.storage.from("business_media").remove(ownStoragePaths);
      if (storageError) console.error(`Error deleting creative media from storage: ${storageError.message}`);
    }

    const { error } = await supabase
      .from("meta_ad_creatives")
      .delete()
      .eq("id", id);

    if (error) throw new Error(`Error deleting creative: ${error.message}`);
  }

  // ==========================================
  // BUSINESSES HELPER
  // ==========================================

  static async getBusinessById(supabase: SupabaseClient, id: string): Promise<any | null> {
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", id)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(`Error fetching business by id: ${error.message}`);
    return data || null;
  }

  static async getBusinesses(supabase: SupabaseClient): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase
      .from("businesses")
      .select("id, name");

    if (error) throw new Error(`Error fetching businesses: ${error.message}`);
    return data || [];
  }

  static async getFirstBusinessId(supabase: SupabaseClient): Promise<string | null> {
    const { data, error } = await supabase
      .from("businesses")
      .select("id")
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(`Error fetching first business: ${error.message}`);
    return data?.id || null;
  }
}
