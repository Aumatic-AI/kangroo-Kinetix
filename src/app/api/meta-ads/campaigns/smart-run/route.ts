import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { requireMetaAdAccountEnv, graphGet, graphPost } from "@/services/meta/graph-client";
import { CampaignsService } from "@/modules/meta-ads/services/campaigns.service";

/**
 * "Make this the live ad" — pauses every sibling ad in the campaign, then
 * activates the ad set, campaign, and target ad, in that order. This is
 * the ONLY thing in the Campaigns tab that intentionally makes an ad
 * start spending; Launch itself always leaves everything paused. Ported
 * from the legacy project's /api/meta/smart-run route.
 */
export async function POST(request: Request) {
  try {
    const { adId } = (await request.json()) as { adId: string };
    if (!adId) return NextResponse.json({ error: "adId is required" }, { status: 400 });

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const { data: ad } = await supabase.from("ads").select("*, ad_sets(*, campaigns(*))").eq("id", adId).single();
    if (!ad?.external_ad_id) return NextResponse.json({ error: "Ad not found or not yet launched" }, { status: 404 });
    const adSet = (ad as any).ad_sets;
    const campaign = adSet?.campaigns;
    if (!adSet?.external_adset_id || !campaign?.external_campaign_id) {
      return NextResponse.json({ error: "This ad's campaign/ad set couldn't be resolved" }, { status: 404 });
    }

    const { accessToken, adAccountId } = requireMetaAdAccountEnv();

    // graphGet URL-encodes every param value itself (via URLSearchParams) —
    // pre-encoding this with encodeURIComponent double-encodes it, so Meta
    // receives a percent-encoded string instead of a JSON array and rejects
    // it with "param filtering must be an array".
    const filter = JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaign.external_campaign_id }]);
    const siblings = await graphGet<{ data?: { id: string; status: string }[] }>(`act_${adAccountId}/ads`, accessToken, {
      fields: "id,status",
      filtering: filter,
      limit: "200",
    });
    const toPause = (siblings.data || []).filter((a) => a.id !== ad.external_ad_id && a.status !== "PAUSED");
    await Promise.allSettled(toPause.map((a) => graphPost(a.id, accessToken, { status: "PAUSED" })));

    await graphPost(adSet.external_adset_id, accessToken, { status: "ACTIVE" });
    await graphPost(campaign.external_campaign_id, accessToken, { status: "ACTIVE" });
    await graphPost(ad.external_ad_id, accessToken, { status: "ACTIVE" });

    await CampaignsService.updateAd(ad.id, { status: "active" });
    await CampaignsService.updateAdSet(adSet.id, { status: "active" });
    await CampaignsService.updateCampaign(campaign.id, { status: "active" });

    return NextResponse.json({ success: true, pausedSiblings: toPause.length });
  } catch (error: any) {
    console.error("[META_ADS_SMART_RUN]", error);
    return NextResponse.json({ error: error.message || "Failed to run smart run" }, { status: 500 });
  }
}
