import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { MetaLeadsImportService } from "@/modules/outreach/services/meta-leads-import.service";
import { PAGE_SIZE_COMPACT } from "@/lib/pagination";

export const dynamic = "force-dynamic";

/** One Meta campaign's individual leads, live — backs the Leads page's
 * "View" drawer (see MetaLeadsImportService.getCampaignLeads). */
export async function GET(request: NextRequest) {
  try {
    const campaignName = request.nextUrl.searchParams.get("campaignName");
    if (!campaignName) return NextResponse.json({ error: "campaignName is required" }, { status: 400 });

    const page = Number(request.nextUrl.searchParams.get("page")) || 1;
    const limit = Number(request.nextUrl.searchParams.get("limit")) || PAGE_SIZE_COMPACT;

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json({ leads: [], count: 0 });

    const { leads, count } = await MetaLeadsImportService.getCampaignLeads(businessId, campaignName, page, limit);
    return NextResponse.json({ leads, count });
  } catch (error: any) {
    console.error("[OUTREACH_META_CAMPAIGN_LEADS]", error);
    return NextResponse.json({ error: error.message || "Failed to load leads" }, { status: 500 });
  }
}
