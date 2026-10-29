import { SupabaseClient } from "@supabase/supabase-js";
import { requireMetaPageEnv, graphGetAllPages } from "@/services/meta/graph-client";

export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "not_interested";
export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "converted", "not_interested"];

interface MetaLeadRow {
  id: string;
  created_time?: string;
  field_data?: { name: string; values: string[] }[];
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
}

/**
 * Pulls every lead for every Instant Form straight from the Meta Graph API
 * and upserts them into our own `leads` table — this is the one and only
 * way leads get into Kinetix now (no webhook: a real-time subscription
 * needs a stable public URL, HMAC secret management, and one-time dashboard
 * registration, none of which is worth it for a single-tenant app where
 * "fresh as of whenever you last opened the Leads page" is good enough).
 * Upserting on `meta_lead_id` makes this safe to call as often as needed —
 * calling it twice in a row just re-writes the same rows, never duplicates.
 */
export class LeadsService {
  static async syncFromMeta(supabase: SupabaseClient, businessId: string): Promise<{ formsChecked: number; leadsImported: number }> {
    const { pageId, pageToken } = requireMetaPageEnv();

    const forms = await graphGetAllPages<{ id: string; name: string }>(`${pageId}/leadgen_forms`, pageToken, { fields: "id,name", limit: "100" });

    let imported = 0;
    for (const form of forms) {
      const leads = await graphGetAllPages<MetaLeadRow>(
        `${form.id}/leads`,
        pageToken,
        { fields: "id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name", limit: "100" }
      );

      for (const lead of leads) {
        let ourAdId: string | null = null;
        if (lead.ad_id) {
          const { data: adRow } = await supabase.from("ads").select("id").eq("external_ad_id", lead.ad_id).maybeSingle();
          ourAdId = adRow?.id || null;
        }
        const fieldData = Object.fromEntries((lead.field_data || []).map((f) => [f.name, f.values?.[0] || ""]));
        const { error } = await supabase.from("leads").upsert(
          {
            business_id: businessId,
            // Meta's own submission time — a lead can be days/weeks old the
            // first time this ever runs, so defaulting to "now" would be wrong.
            created_at: lead.created_time || new Date().toISOString(),
            ad_id: ourAdId,
            ad_name: lead.ad_name || null,
            adset_name: lead.adset_name || null,
            campaign_name: lead.campaign_name || null,
            meta_form_id: form.id,
            meta_lead_id: lead.id,
            field_data: fieldData,
          },
          { onConflict: "meta_lead_id" }
        );
        if (!error) imported++;
      }
    }

    return { formsChecked: forms.length, leadsImported: imported };
  }

  /** A plain partial update — unlike syncFromMeta's upsert above, this never
   * touches any other column, so it can't collide with a later sync. */
  static async updateStatus(supabase: SupabaseClient, id: string, status: LeadStatus): Promise<void> {
    const { error } = await supabase.from("leads").update({ status }).eq("id", id);
    if (error) throw new Error(`Error updating lead status: ${error.message}`);
  }
}
