import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Lead, LeadSummary, LeadFilters, PaginationOptions, LeadListSummary, LeadCampaignHistoryEntry } from "../types/leads.types";
import { OutreachCampaign, OutreachCampaignStatusEntry } from "../types/outreach.types";
import { InstantlyService, InstantlyCampaignAnalytics } from "@/services/instantly";
import { resolveCampaignStatus } from "../utils/campaign-status";
import { rangeFor } from "@/lib/pagination";

interface CampaignLeadHistoryRow {
  status: "queued" | "sent" | "failed";
  sent_at: string | null;
  outreach_campaigns: { id: string; name: string } | null;
}

function rate(count: number, sent: number): number {
  return sent > 0 ? Math.round((count / sent) * 100) : 0;
}

/** Single merge of one campaign row with Instantly's live analytics —
 * shared by getCampaignsWithAnalytics (all campaigns) and
 * getCampaignAnalyticsEntry (one campaign), so this computation only
 * lives in one place. */
async function resolveCampaignEntry(
  supabase: SupabaseClient,
  campaign: { id: string; status: string; external_campaign_id: string | null },
  instantlyByExternalId: Map<string, InstantlyCampaignAnalytics>
): Promise<OutreachCampaignStatusEntry> {
  const instantlyEntry = campaign.external_campaign_id ? instantlyByExternalId.get(campaign.external_campaign_id) : undefined;

  const sent = instantlyEntry?.emails_sent_count || 0;
  const opened = instantlyEntry?.open_count_unique || 0;
  const replied = instantlyEntry?.reply_count_unique || 0;
  const clicked = instantlyEntry?.link_click_count_unique || 0;
  const bounced = instantlyEntry?.bounced_count || 0;
  const unsubscribed = instantlyEntry?.unsubscribed_count || 0;

  // Only needed to tell "sending" from "sent" apart — skip the query otherwise.
  let recipientsTargeted: number | undefined;
  if (instantlyEntry?.campaign_status === 1) {
    const { count } = await supabase
      .from("outreach_campaign_leads")
      .select("lead_id", { count: "exact", head: true })
      .eq("outreach_campaign_id", campaign.id);
    recipientsTargeted = count || 0;
  }

  const status = resolveCampaignStatus({
    localStatus: campaign.status,
    externalCampaignId: campaign.external_campaign_id,
    instantlyStatus: instantlyEntry?.campaign_status,
    sent,
    recipientsTargeted,
  });

  return {
    ...status,
    sent,
    opened,
    openRate: rate(opened, sent),
    replied,
    replyRate: rate(replied, sent),
    clicked,
    clickRate: rate(clicked, sent),
    bounced,
    bounceRate: rate(bounced, sent),
    unsubscribed,
  };
}

/** Server-context only (API routes) — each method opens its own
 * request-scoped client via @/lib/supabase/server rather than taking one
 * as a parameter. */
export class LeadsService {
  static async getLeads(businessId: string, filters?: LeadFilters, pagination?: PaginationOptions): Promise<{ leads: LeadSummary[]; count: number }> {
    const supabase = await createClient();
    let query = supabase.from("outreach_leads").select("id, first_name, last_name, email, city, country", { count: "exact" }).eq("business_id", businessId);

    if (filters?.listId) query = query.eq("list_id", filters.listId);
    if (filters?.listIds?.length) query = query.in("list_id", filters.listIds);
    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.excludeStatuses?.length) {
      query = query.not("status", "in", `(${filters.excludeStatuses.join(",")})`);
    }
    if (filters?.search) {
      query = query.or(`email.ilike.%${filters.search}%,first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,company.ilike.%${filters.search}%`);
    }

    query = query.order("created_at", { ascending: false });

    if (pagination) {
      const page = pagination.page || 1;
      const limit = pagination.limit || 50;
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`Error fetching leads: ${error.message}`);
    return { leads: (data as LeadSummary[]) || [], count: count || 0 };
  }

  static async createLead(row: Partial<Lead> & { business_id: string; email: string }): Promise<Lead> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("outreach_leads").insert(row).select("*").single();
    if (error) {
      if (error.code === "23505") throw new Error("A lead with this email already exists.");
      throw new Error(`Error creating lead: ${error.message}`);
    }
    return data as Lead;
  }

  static async deleteLead(id: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("outreach_leads").delete().eq("id", id);
    if (error) throw new Error(`Error deleting lead: ${error.message}`);
  }

  /** Every campaign this lead was ever queued for, most recent first — from
   * our own outreach_campaign_leads, not a live Instantly call (see
   * LeadCampaignHistoryEntry for why open/reply aren't included here). */
  static async getCampaignHistory(leadId: string): Promise<LeadCampaignHistoryEntry[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("outreach_campaign_leads")
      .select("status, sent_at, outreach_campaigns(id, name)")
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(`Error fetching lead campaign history: ${error.message}`);

    return ((data as unknown as CampaignLeadHistoryRow[]) || [])
      .filter((row) => row.outreach_campaigns !== null)
      .map((row) => ({
        campaignId: row.outreach_campaigns!.id,
        campaignName: row.outreach_campaigns!.name,
        status: row.status,
        sentAt: row.sent_at,
      }));
  }

  /** `listIds` scopes the scan to just those lists (e.g. one paginated
   * page's worth) instead of pulling every lead row this business owns —
   * pass it whenever the caller already knows which lists it needs counts
   * for. Omit only when every list's count is genuinely needed at once. */
  static async getListLeadCounts(businessId: string, listIds?: string[]): Promise<Record<string, number>> {
    const supabase = await createClient();
    let query = supabase.from("outreach_leads").select("list_id").eq("business_id", businessId);
    if (listIds) query = query.in("list_id", listIds);
    const { data, error } = await query;
    if (error) throw new Error(`Error computing list lead counts: ${error.message}`);
    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const key = row.list_id || "unassigned";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }
}

export class LeadListsService {
  /** Omit `pagination` for the full, unpaginated list; pass it for a
   * paginated table. Not currently called by any page — see useLeadLists'
   * own comment. */
  static async getLists(businessId: string, pagination?: PaginationOptions): Promise<{ lists: LeadListSummary[]; total: number }> {
    const supabase = await createClient();
    let query = supabase
      .from("outreach_lead_lists")
      .select("id, name", { count: "exact" })
      .eq("business_id", businessId)
      .order("name", { ascending: true });
    if (pagination) {
      const page = pagination.page || 1;
      const limit = pagination.limit || 50;
      const [from, to] = rangeFor(page, limit);
      query = query.range(from, to);
    }
    const { data, error, count } = await query;
    if (error) throw new Error(`Error fetching lists: ${error.message}`);
    return { lists: (data as LeadListSummary[]) || [], total: count || 0 };
  }

  static async getListById(id: string): Promise<LeadListSummary | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("outreach_lead_lists").select("id, name").eq("id", id).single();
    if (error && error.code !== "PGRST116") throw new Error(`Error fetching list: ${error.message}`);
    return (data as LeadListSummary) || null;
  }
}

export class OutreachCampaignsService {
  /** Omit `pagination` for the full set (Dashboard/Analytics, which need
   * every campaign to aggregate totals); pass it for the Campaigns page's
   * paginated table. */
  static async getCampaigns(businessId: string, pagination?: PaginationOptions): Promise<{ campaigns: OutreachCampaign[]; total: number }> {
    const supabase = await createClient();
    let query = supabase
      .from("outreach_campaigns")
      .select("*", { count: "exact" })
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (pagination) {
      const page = pagination.page || 1;
      const limit = pagination.limit || 50;
      const [from, to] = rangeFor(page, limit);
      query = query.range(from, to);
    }
    const { data, error, count } = await query;
    if (error) throw new Error(`Error fetching outreach campaigns: ${error.message}`);
    return { campaigns: (data as unknown as OutreachCampaign[]) || [], total: count || 0 };
  }

  static async getCampaignById(id: string): Promise<OutreachCampaign | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("outreach_campaigns").select("*").eq("id", id).single();
    if (error && error.code !== "PGRST116") throw new Error(`Error fetching outreach campaign: ${error.message}`);
    return (data as unknown as OutreachCampaign) || null;
  }

  /** Every campaign this business owns (or just one page of them — see
   * getCampaigns), each merged with its live Instantly analytics — the one
   * place the Campaigns list, Dashboard, and /analytics all get this from,
   * so the Instantly call + resolveCampaignStatus logic isn't duplicated
   * between them. Dashboard/Analytics omit `pagination` (they aggregate
   * over every campaign); the Campaigns page passes it. */
  static async getCampaignsWithAnalytics(
    businessId: string,
    pagination?: PaginationOptions
  ): Promise<{ rows: { campaign: OutreachCampaign; entry: OutreachCampaignStatusEntry }[]; total: number }> {
    const supabase = await createClient();
    const { campaigns, total } = await this.getCampaigns(businessId, pagination);
    if (campaigns.length === 0) return { rows: [], total };

    const instantlyAnalytics = await InstantlyService.getCampaignsAnalytics();
    const instantlyByExternalId = new Map(instantlyAnalytics.map((c) => [c.campaign_id, c]));

    const rows: { campaign: OutreachCampaign; entry: OutreachCampaignStatusEntry }[] = [];
    for (const campaign of campaigns) {
      rows.push({ campaign, entry: await resolveCampaignEntry(supabase, campaign, instantlyByExternalId) });
    }
    return { rows, total };
  }

  /** Same merge as getCampaignsWithAnalytics, for a single already-fetched
   * campaign — the Campaign Detail page's one API call needs just this
   * one entry, not every campaign this business owns. */
  static async getCampaignAnalyticsEntry(campaign: OutreachCampaign): Promise<OutreachCampaignStatusEntry> {
    const supabase = await createClient();
    const instantlyAnalytics = await InstantlyService.getCampaignsAnalytics();
    const instantlyByExternalId = new Map(instantlyAnalytics.map((c) => [c.campaign_id, c]));
    return resolveCampaignEntry(supabase, campaign, instantlyByExternalId);
  }

  static async createCampaign(row: Partial<OutreachCampaign> & { business_id: string; list_id: string; name: string }): Promise<OutreachCampaign> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("outreach_campaigns").insert(row as any).select("*").single();
    if (error) throw new Error(`Error creating outreach campaign: ${error.message}`);
    return data as unknown as OutreachCampaign;
  }

  /** The real list(s) a campaign targets — replaces whatever was there
   * before (a campaign always has exactly the set passed here, not an
   * accumulation). `list_id` on the campaign row itself is left as the
   * first of these, purely for old code paths that still read it directly. */
  static async setCampaignLists(campaignId: string, listIds: string[]): Promise<void> {
    const supabase = await createClient();
    await supabase.from("outreach_campaign_lists").delete().eq("outreach_campaign_id", campaignId);
    if (listIds.length === 0) return;
    const { error } = await supabase
      .from("outreach_campaign_lists")
      .insert(listIds.map((list_id) => ({ outreach_campaign_id: campaignId, list_id })));
    if (error) throw new Error(`Error setting campaign lists: ${error.message}`);
  }

  /** Falls back to the legacy single list_id for a campaign created before
   * multi-list support, so nothing already sent loses its list association. */
  static async getCampaignListIds(campaign: { id: string; list_id: string | null }): Promise<string[]> {
    const supabase = await createClient();
    const { data } = await supabase.from("outreach_campaign_lists").select("list_id").eq("outreach_campaign_id", campaign.id);
    if (data && data.length > 0) return data.map((r) => r.list_id);
    return campaign.list_id ? [campaign.list_id] : [];
  }

  static async updateCampaign(id: string, row: Partial<OutreachCampaign>): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("outreach_campaigns").update(row as any).eq("id", id);
    if (error) throw new Error(`Error updating outreach campaign: ${error.message}`);
  }

  static async deleteCampaign(id: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("outreach_campaigns").delete().eq("id", id);
    if (error) throw new Error(`Error deleting outreach campaign: ${error.message}`);
  }
}
