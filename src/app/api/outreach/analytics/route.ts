import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { OutreachCampaignsService } from "@/modules/outreach/services/outreach.service";
import { OutreachAnalyticsResponse } from "@/modules/outreach/types/outreach.types";

const EMPTY: OutreachAnalyticsResponse = {
  totalLeads: 0,
  totalCampaignsSent: 0,
  totals: { sent: 0, opened: 0, replied: 0, bounced: 0 },
  byCampaignId: {},
};

/** Dashboard-wide totals + the per-campaign status entries shown on the
 * Campaign Detail page — the Campaigns list itself no longer calls this
 * (see /api/outreach/campaigns), so this only feeds Dashboard and Campaign
 * Detail now. Reuses getCampaignsWithAnalytics rather than re-fetching and
 * re-resolving Instantly analytics itself. */
export async function GET() {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json(EMPTY);

    const { count: totalLeads } = await supabase
      .from("outreach_leads")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId);

    const { rows } = await OutreachCampaignsService.getCampaignsWithAnalytics(businessId);

    const response: OutreachAnalyticsResponse = {
      totalLeads: totalLeads || 0,
      totalCampaignsSent: 0,
      totals: { sent: 0, opened: 0, replied: 0, bounced: 0 },
      byCampaignId: {},
    };

    for (const { campaign, entry } of rows) {
      response.byCampaignId[campaign.id] = entry;

      if (entry.value === "sending" || entry.value === "sent") {
        response.totalCampaignsSent += 1;
        response.totals.sent += entry.sent;
        response.totals.opened += entry.opened;
        response.totals.replied += entry.replied;
        response.totals.bounced += entry.bounced;
      }
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[OUTREACH_ANALYTICS]", error);
    return NextResponse.json({ error: error.message || "Failed to load analytics" }, { status: 500 });
  }
}
