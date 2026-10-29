import { createClient } from "@/lib/supabase/server";
import { Campaign, CampaignListRow, AdSet, Ad } from "../types/meta-ads.types";
import { rangeFor } from "@/lib/pagination";

/**
 * Our own campaigns/ad_sets/ads rows — a POINTER to the real Meta objects
 * (external_campaign_id/external_adset_id/external_ad_id), never a mirror
 * of live status or spend. Current status and performance are always
 * fetched live from the Graph API (see the campaigns/reports API routes) —
 * these rows only exist so we know which business owns a campaign and
 * which of our own creatives an ad is running.
 *
 * Server-context only (API routes) — each method opens its own request-scoped
 * client via @/lib/supabase/server rather than taking one as a parameter.
 */
export class CampaignsService {
  static async getCampaignsByBusiness(businessId: string, page: number, limit: number): Promise<{ campaigns: CampaignListRow[]; total: number }> {
    const supabase = await createClient();
    const [from, to] = rangeFor(page, limit);
    const { data, error, count } = await supabase
      .from("campaigns")
      .select("id, created_at, name, objective, status, external_campaign_id", { count: "exact" })
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(`Error fetching campaigns: ${error.message}`);
    return { campaigns: (data as CampaignListRow[]) || [], total: count || 0 };
  }

  static async getCampaignById(id: string): Promise<Campaign | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("campaigns").select("*").eq("id", id).single();
    if (error && error.code !== "PGRST116") throw new Error(`Error fetching campaign: ${error.message}`);
    return (data as Campaign) || null;
  }

  static async getAdSetsByCampaign(campaignId: string): Promise<AdSet[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ad_sets").select("*").eq("campaign_id", campaignId);
    if (error) throw new Error(`Error fetching ad sets: ${error.message}`);
    return (data as AdSet[]) || [];
  }

  static async getAdSetById(id: string): Promise<AdSet | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ad_sets").select("*").eq("id", id).single();
    if (error && error.code !== "PGRST116") throw new Error(`Error fetching ad set: ${error.message}`);
    return (data as AdSet) || null;
  }

  static async getAdById(id: string): Promise<Ad | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ads").select("*").eq("id", id).single();
    if (error && error.code !== "PGRST116") throw new Error(`Error fetching ad: ${error.message}`);
    return (data as Ad) || null;
  }

  static async getAdsByAdSets(adSetIds: string[]): Promise<Ad[]> {
    if (adSetIds.length === 0) return [];
    const supabase = await createClient();
    const { data, error } = await supabase.from("ads").select("*").in("ad_set_id", adSetIds);
    if (error) throw new Error(`Error fetching ads: ${error.message}`);
    return (data as Ad[]) || [];
  }

  static async getAllAdsByBusiness(businessId: string): Promise<Ad[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ads").select("*").eq("business_id", businessId);
    if (error) throw new Error(`Error fetching ads: ${error.message}`);
    return (data as Ad[]) || [];
  }

  static async createCampaign(row: Partial<Campaign> & { business_id: string; name: string }): Promise<Campaign> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("campaigns").insert(row).select("*").single();
    if (error) throw new Error(`Error creating campaign row: ${error.message}`);
    return data as Campaign;
  }

  static async createAdSet(row: Partial<AdSet> & { business_id: string; campaign_id: string; name: string }): Promise<AdSet> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ad_sets").insert(row).select("*").single();
    if (error) throw new Error(`Error creating ad set row: ${error.message}`);
    return data as AdSet;
  }

  static async createAd(row: Partial<Ad> & { business_id: string; ad_set_id: string; name: string }): Promise<Ad> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ads").insert(row).select("*").single();
    if (error) throw new Error(`Error creating ad row: ${error.message}`);
    return data as Ad;
  }

  static async updateCampaign(id: string, row: Partial<Campaign>): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("campaigns").update(row).eq("id", id);
    if (error) throw new Error(`Error updating campaign row: ${error.message}`);
  }

  static async updateAdSet(id: string, row: Partial<AdSet>): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("ad_sets").update(row).eq("id", id);
    if (error) throw new Error(`Error updating ad set row: ${error.message}`);
  }

  static async updateAd(id: string, row: Partial<Ad>): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("ads").update(row).eq("id", id);
    if (error) throw new Error(`Error updating ad row: ${error.message}`);
  }

  static async findByExternalId(level: "campaign" | "adset" | "ad", externalId: string): Promise<{ id: string } | null> {
    const supabase = await createClient();
    const { data, error } =
      level === "campaign"
        ? await supabase.from("campaigns").select("id").eq("external_campaign_id", externalId).maybeSingle()
        : level === "adset"
        ? await supabase.from("ad_sets").select("id").eq("external_adset_id", externalId).maybeSingle()
        : await supabase.from("ads").select("id").eq("external_ad_id", externalId).maybeSingle();
    if (error) throw new Error(`Error looking up ${level} by external id: ${error.message}`);
    return data;
  }
}
