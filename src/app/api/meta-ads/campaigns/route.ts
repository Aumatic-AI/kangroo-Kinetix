import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { requireMetaAdAccountEnv, graphGet } from "@/services/meta/graph-client";
import { CampaignsService } from "@/modules/meta-ads/services/campaigns.service";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { CampaignListItem } from "@/modules/meta-ads/types/meta-ads.types";
import { paginationMeta, PAGE_SIZE_COMPACT } from "@/lib/pagination";

interface LiveCampaign {
  id: string;
  status: string;
  created_time?: string;
  adsets?: { data?: { id: string; status: string; ads?: { data?: { id: string; status: string }[] } }[] };
}

/**
 * Always live — our own campaigns rows are only a pointer (business +
 * creative ownership); current status/budget always comes straight from
 * Meta so this list can never show stale numbers. One nested Graph call
 * covers the whole account instead of one call per campaign.
 */
export async function GET(request: NextRequest) {
  try {
    const page = Number(request.nextUrl.searchParams.get("page")) || 1;
    const limit = Number(request.nextUrl.searchParams.get("limit")) || PAGE_SIZE_COMPACT;

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json({ campaigns: [], ...paginationMeta(0, page, limit) });

    const { campaigns: ourCampaigns, total } = await CampaignsService.getCampaignsByBusiness(businessId, page, limit);
    if (ourCampaigns.length === 0) return NextResponse.json({ campaigns: [], ...paginationMeta(total, page, limit) });

    const { accessToken, adAccountId } = requireMetaAdAccountEnv();
    const live = await graphGet<{ data?: LiveCampaign[] }>(`act_${adAccountId}/campaigns`, accessToken, {
      fields: "id,status,created_time,adsets{id,status,ads{id,status}}",
      limit: "200",
    });
    const liveById = new Map((live.data || []).map((c) => [c.id, c]));

    const campaigns: CampaignListItem[] = ourCampaigns.map((c) => {
      const liveData = c.external_campaign_id ? liveById.get(c.external_campaign_id) : undefined;
      const adSets = liveData?.adsets?.data || [];
      const adCount = adSets.reduce((sum, as) => sum + (as.ads?.data?.length || 0), 0);
      return {
        id: c.id,
        externalCampaignId: c.external_campaign_id || "",
        name: c.name,
        objective: c.objective,
        status: liveData?.status || (c.status === "draft" ? "NOT_ON_META" : c.status.toUpperCase()),
        // Meta's own creation date, not ours — our pointer row's created_at
        // is just when we synced/launched it, which for backfilled
        // campaigns is today regardless of how long the campaign has
        // actually been running on Meta.
        createdAt: liveData?.created_time || c.created_at,
        adSetCount: adSets.length,
        adCount,
      };
    });

    return NextResponse.json({ campaigns, ...paginationMeta(total, page, limit) });
  } catch (error: any) {
    console.error("[META_ADS_CAMPAIGNS_LIST]", error);
    return NextResponse.json({ error: error.message || "Failed to load campaigns" }, { status: 500 });
  }
}
