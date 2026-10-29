import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { OutreachCampaignsService } from "@/modules/outreach/services/outreach.service";

/** Preview shown before a "ready" campaign is actually sent — same
 * suppression rule send-campaign.ts's fetch-recipients step uses
 * (bounced/do_not_contact/replied), summed across every list this campaign
 * targets, so the number shown here always matches what a real Send would do. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const campaign = await OutreachCampaignsService.getCampaignById(id);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const supabase = (await createClient()) as SupabaseClient<Database>;

    const listIds = await OutreachCampaignsService.getCampaignListIds(campaign);
    const { data: lists } = listIds.length ? await supabase.from("outreach_lead_lists").select("name").in("id", listIds) : { data: [] };

    const { count: eligibleLeads } = listIds.length
      ? await supabase
          .from("outreach_leads")
          .select("id", { count: "exact", head: true })
          .eq("business_id", campaign.business_id)
          .in("list_id", listIds)
          .not("status", "in", "(bounced,do_not_contact,replied)")
      : { count: 0 };

    return NextResponse.json({
      listName: (lists || []).map((l) => l.name).join(", ") || "Unknown list",
      eligibleLeads: eligibleLeads || 0,
      dailyLimit: campaign.daily_limit,
    });
  } catch (error) {
    console.error("[OUTREACH_CAMPAIGN_SEND_PREVIEW]", error);
    const message = error instanceof Error ? error.message : "Failed to load send preview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
