import { createClient } from "@/lib/supabase/server";
import { MetaCampaignLeadBreakdown, MetaCampaignLead } from "../types/leads.types";
import { MillionVerifierService } from "@/services/millionverifier";
import { rangeFor } from "@/lib/pagination";

// Same candidate keys Meta Ads' own LeadDetailsModal/LeadsTable already use
// to read a lead's field_data — Instant Form field names vary per form, so
// these are tried in order rather than assumed fixed.
const EMAIL_FIELD_KEYS = ["email", "work_email"];
const FULL_NAME_KEY = "full_name";
const FIRST_NAME_KEY = "first_name";
const LAST_NAME_KEY = "last_name";

function extractEmail(fieldData: Record<string, string>): string | null {
  for (const key of EMAIL_FIELD_KEYS) if (fieldData[key]) return fieldData[key];
  return null;
}

function extractName(fieldData: Record<string, string>): { firstName: string | null; lastName: string | null } {
  if (fieldData[FIRST_NAME_KEY] || fieldData[LAST_NAME_KEY]) {
    return { firstName: fieldData[FIRST_NAME_KEY] || null, lastName: fieldData[LAST_NAME_KEY] || null };
  }
  if (fieldData[FULL_NAME_KEY]) {
    const [firstName, ...rest] = fieldData[FULL_NAME_KEY].trim().split(/\s+/);
    return { firstName: firstName || null, lastName: rest.join(" ") || null };
  }
  return { firstName: null, lastName: null };
}

export interface ImportMetaCampaignResult {
  listId: string;
  imported: number;
  alreadyImported: number;
  skippedNoEmail: number;
  skippedUnverified: number;
}

/**
 * Bridges Meta Ads' captured Instant Form leads (`leads` table, one row per
 * business, `field_data` shaped per-form) into Outreach's own `outreach_leads`
 * — grouped by Meta campaign, since each Meta campaign becomes a selectable
 * "list" in Outreach. Browsing/counting (getCampaignBreakdown) is always
 * live, computed from our own already-synced `leads` table (no extra Meta
 * API call) so it's cheap to call on every page load. Only importCampaignLeads
 * writes anything — called once a Meta campaign is actually picked to target
 * an Outreach campaign, not before.
 */
export class MetaLeadsImportService {
  /** Every Meta campaign that has at least one lead, with a live total count
   * and how many of those actually have a usable email — not filtered by
   * lead status, matching "leads coming from that campaign" literally. */
  static async getCampaignBreakdown(businessId: string): Promise<MetaCampaignLeadBreakdown[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("leads").select("campaign_name, field_data").eq("business_id", businessId);
    if (error) throw new Error(`Error fetching Meta leads: ${error.message}`);

    const byCampaign = new Map<string, { total: number; emailable: number }>();
    for (const row of data || []) {
      const name = row.campaign_name || "Unknown Campaign";
      const entry = byCampaign.get(name) || { total: 0, emailable: 0 };
      entry.total += 1;
      if (extractEmail((row.field_data as Record<string, string>) || {})) entry.emailable += 1;
      byCampaign.set(name, entry);
    }

    return Array.from(byCampaign.entries()).map(([campaignName, v]) => ({ campaignName, totalLeads: v.total, emailableLeads: v.emailable }));
  }

  /** One Meta campaign's individual leads, live — backs the Leads page's
   * "View" drawer. Reads straight from Meta Ads' own `leads` table, not
   * outreach_leads, so browsing never depends on anything having been
   * imported first. `email` is null when that lead's Instant Form answer
   * didn't include one. */
  static async getCampaignLeads(businessId: string, campaignName: string, page: number, limit: number): Promise<{ leads: MetaCampaignLead[]; count: number }> {
    const supabase = await createClient();
    const [from, to] = rangeFor(page, limit);
    const { data, error, count } = await supabase
      .from("leads")
      .select("id, field_data", { count: "exact" })
      .eq("business_id", businessId)
      .eq("campaign_name", campaignName)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(`Error fetching leads for "${campaignName}": ${error.message}`);

    const leads: MetaCampaignLead[] = (data || []).map((row) => {
      const fieldData = (row.field_data as Record<string, string>) || {};
      const { firstName, lastName } = extractName(fieldData);
      return { id: row.id, first_name: firstName, last_name: lastName, email: extractEmail(fieldData) };
    });

    return { leads, count: count || 0 };
  }

  /** Find-or-create a list named after the Meta campaign, then upsert every
   * one of its leads that has a resolvable, MillionVerifier-verified email
   * into outreach_leads — same "only genuinely verified addresses are ever
   * saved" rule the Apify scrape flow already uses. Safe to call again for
   * the same campaign later (idempotent — reuses the list, skips leads
   * already imported without re-verifying them, so re-picking this campaign
   * for a future outreach campaign only pulls in what's new since last time). */
  static async importCampaignLeads(businessId: string, campaignName: string): Promise<ImportMetaCampaignResult> {
    const supabase = await createClient();

    const listName = `Meta: ${campaignName}`;
    let listId: string;
    const { data: existingList } = await supabase.from("outreach_lead_lists").select("id").eq("business_id", businessId).eq("name", listName).maybeSingle();
    if (existingList) {
      listId = existingList.id;
    } else {
      const { data: createdList, error: createListError } = await supabase
        .from("outreach_lead_lists")
        .insert({ business_id: businessId, name: listName })
        .select("id")
        .single();
      if (createListError || !createdList) throw new Error(`Error creating list for "${campaignName}": ${createListError?.message}`);
      listId = createdList.id;
    }

    const { data: metaLeads, error } = await supabase.from("leads").select("field_data").eq("business_id", businessId).eq("campaign_name", campaignName);
    if (error) throw new Error(`Error fetching Meta leads for "${campaignName}": ${error.message}`);

    const { data: existingOutreachLeads } = await supabase.from("outreach_leads").select("email").eq("business_id", businessId);
    const alreadyImportedEmails = new Set((existingOutreachLeads || []).map((r) => r.email));

    let imported = 0;
    let alreadyImported = 0;
    let skippedNoEmail = 0;
    let skippedUnverified = 0;

    for (const row of metaLeads || []) {
      const fieldData = (row.field_data as Record<string, string>) || {};
      const email = extractEmail(fieldData);
      if (!email) {
        skippedNoEmail++;
        continue;
      }
      if (alreadyImportedEmails.has(email)) {
        alreadyImported++;
        continue;
      }

      const verification = await MillionVerifierService.verify(email);
      if (verification !== "verified") {
        skippedUnverified++;
        continue;
      }

      const { firstName, lastName } = extractName(fieldData);
      const { error: upsertError } = await supabase.from("outreach_leads").upsert(
        {
          business_id: businessId,
          list_id: listId,
          email,
          first_name: firstName,
          last_name: lastName,
          source: "import",
          email_verification_status: "verified",
        },
        { onConflict: "business_id,email" }
      );
      if (!upsertError) {
        imported++;
        alreadyImportedEmails.add(email);
      }
    }

    return { listId, imported, alreadyImported, skippedNoEmail, skippedUnverified };
  }
}
