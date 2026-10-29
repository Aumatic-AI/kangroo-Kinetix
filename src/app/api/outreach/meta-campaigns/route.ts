import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { MetaLeadsImportService } from "@/modules/outreach/services/meta-leads-import.service";

export const dynamic = "force-dynamic";

/** Live breakdown of Meta Ads campaigns with leads — shown in campaign
 * creation as selectable entries alongside real outreach_lead_lists. Reads
 * our own already-synced `leads` table (no live Meta API call), so this is
 * cheap enough to call on every page load. */
export async function GET() {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json({ campaigns: [] });

    const campaigns = await MetaLeadsImportService.getCampaignBreakdown(businessId);
    return NextResponse.json({ campaigns });
  } catch (error: any) {
    console.error("[OUTREACH_META_CAMPAIGNS]", error);
    return NextResponse.json({ error: error.message || "Failed to load Meta campaigns" }, { status: 500 });
  }
}
