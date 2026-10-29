import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { requireMetaAdAccountEnv, graphPost } from "@/services/meta/graph-client";
import { CampaignsService } from "@/modules/meta-ads/services/campaigns.service";

type Level = "campaign" | "adset" | "ad";
const OUR_STATUS: Record<string, "active" | "paused" | "archived"> = { ACTIVE: "active", PAUSED: "paused", ARCHIVED: "archived" };

/**
 * One generic pause/resume/archive endpoint for any level of the hierarchy
 * — Meta's status update shape is identical at every level, so this is the
 * same generic route the legacy project used, plus mirroring the change
 * onto our own pointer row.
 */
export async function POST(request: Request) {
  try {
    const { id, level, status } = (await request.json()) as { id: string; level: Level; status: "ACTIVE" | "PAUSED" | "ARCHIVED" };
    if (!id || !level || !status) return NextResponse.json({ error: "id, level, and status are required" }, { status: 400 });

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const table: "campaigns" | "ad_sets" | "ads" = level === "campaign" ? "campaigns" : level === "adset" ? "ad_sets" : "ads";
    const externalColumn = level === "campaign" ? "external_campaign_id" : level === "adset" ? "external_adset_id" : "external_ad_id";
    const { data: row, error } = await supabase.from(table).select("*").eq("id", id).single();
    if (error || !row) return NextResponse.json({ error: `${level} not found` }, { status: 404 });

    const externalId = (row as any)[externalColumn];
    if (!externalId) return NextResponse.json({ error: `This ${level} was never launched to Meta` }, { status: 400 });

    const { accessToken } = requireMetaAdAccountEnv();
    await graphPost(externalId, accessToken, { status });

    if (level === "campaign") await CampaignsService.updateCampaign(id, { status: OUR_STATUS[status] });
    else if (level === "adset") await CampaignsService.updateAdSet(id, { status: OUR_STATUS[status] });
    else await CampaignsService.updateAd(id, { status: OUR_STATUS[status] });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[META_ADS_STATUS]", error);
    return NextResponse.json({ error: error.message || "Failed to update status" }, { status: 500 });
  }
}
