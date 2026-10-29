import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { requireMetaAdAccountEnv, graphGet, graphPost } from "@/services/meta/graph-client";
import { CampaignsService } from "@/modules/meta-ads/services/campaigns.service";

/**
 * Meta ad creatives are immutable — there is no "edit the headline" call.
 * Editing text means: read the live creative's object_story_spec, patch
 * only the changed fields, create a brand-new creative object with that
 * spec (preserving the existing image_hash/video_id so the media doesn't
 * change), then repoint the ad at it. Ported from the legacy project's
 * /api/meta/update route.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ adId: string }> }) {
  try {
    const { adId } = await params;
    const body = (await request.json()) as { headline?: string; primaryText?: string; ctaType?: string; websiteUrl?: string };

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const { data: ad, error } = await supabase.from("ads").select("*").eq("id", adId).single();
    if (error || !ad?.external_ad_id || !ad.external_creative_id) {
      return NextResponse.json({ error: "Ad not found or not yet launched" }, { status: 404 });
    }

    const { accessToken, adAccountId } = requireMetaAdAccountEnv();
    const current = await graphGet<{ name: string; object_story_spec: any }>(ad.external_creative_id, accessToken, {
      fields: "name,object_story_spec",
    });
    const spec = JSON.parse(JSON.stringify(current.object_story_spec || {}));
    const isVideo = !!spec.video_data;
    const branch = isVideo ? spec.video_data : spec.link_data;

    if (body.headline !== undefined) branch[isVideo ? "title" : "name"] = body.headline;
    if (body.primaryText !== undefined) branch.message = body.primaryText;
    if (body.ctaType !== undefined || body.websiteUrl !== undefined) {
      const existingLink = branch.call_to_action?.value?.link || body.websiteUrl || "";
      branch.call_to_action = {
        type: body.ctaType || branch.call_to_action?.type || "LEARN_MORE",
        value: { ...(branch.call_to_action?.value || {}), ...(body.websiteUrl !== undefined ? { link: body.websiteUrl } : { link: existingLink }) },
      };
    }
    if (!isVideo && body.websiteUrl !== undefined) branch.link = body.websiteUrl;

    const newCreative = await graphPost<{ id: string }>(`act_${adAccountId}/adcreatives`, accessToken, {
      name: `${current.name || "Creative"}_edited_${Date.now()}`,
      object_story_spec: spec,
    });

    await graphPost(ad.external_ad_id, accessToken, { creative: { creative_id: newCreative.id } });
    await CampaignsService.updateAd(adId, { external_creative_id: newCreative.id });

    return NextResponse.json({ success: true, externalCreativeId: newCreative.id });
  } catch (error: any) {
    console.error("[META_ADS_AD_CREATIVE_EDIT]", error);
    return NextResponse.json({ error: error.message || "Failed to update ad creative" }, { status: 500 });
  }
}
