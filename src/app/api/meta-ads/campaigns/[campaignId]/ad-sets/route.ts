import { NextResponse } from "next/server";
import { requireMetaAdAccountEnv, graphPost } from "@/services/meta/graph-client";
import { buildTargeting, buildPlacements, budgetField, resolvePageId, getOrCreatePixelId } from "@/modules/meta-ads/services/launch.service";
import { CampaignsService } from "@/modules/meta-ads/services/campaigns.service";
import { CreateAdSetInput, MetaObjective, OBJECTIVE_GOALS } from "@/modules/meta-ads/types/meta-ads.types";

/**
 * "+ Add Ad Set" on an existing campaign, from the Campaign Detail page.
 * Creates an empty Ad Set only — no ad/creative yet (Meta allows an Ad Set
 * with zero Ads). Ads get added afterward from the Ad Set Detail page's
 * "Create Ad" action instead (campaigns/ad-sets/[adSetId]/ads). CBO/
 * objective are inherited from the parent campaign's own row — never
 * re-derived from Meta or re-asked of the user, since both are locked at
 * campaign-creation time.
 */
export async function POST(request: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  try {
    const { campaignId } = await params;
    const body = (await request.json()) as CreateAdSetInput;

    if (!body.adSetName) return NextResponse.json({ error: "Missing required field: adSetName" }, { status: 400 });

    const campaign = await CampaignsService.getCampaignById(campaignId);
    if (!campaign?.external_campaign_id) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    const isCbo = campaign.daily_budget_cents != null || campaign.lifetime_budget_cents != null;
    if (!isCbo) {
      const needsAmount = body.budgetType === "lifetime" ? !body.lifetimeBudgetCents : !body.dailyBudgetCents;
      if (needsAmount) return NextResponse.json({ error: "This campaign uses per-ad-set budgets — enter an amount." }, { status: 400 });
    }

    const { accessToken, adAccountId } = requireMetaAdAccountEnv();

    const objective = (campaign.objective || "OUTCOME_TRAFFIC") as MetaObjective;
    const optimizationGoal = body.optimizationGoal || OBJECTIVE_GOALS[objective][0].value;

    // These two goals need a Meta object attached at the AD SET level
    // regardless of whether any ad/lead-form exists yet — Lead Generation
    // always needs a Page, Conversions always needs a Pixel. The specific
    // Instant Form is chosen later, per-ad, on the Ad Set Detail page.
    let promotedObject: Record<string, unknown> | undefined;
    let trackingSpecs: unknown[] | undefined;
    if (optimizationGoal === "LEAD_GENERATION") {
      promotedObject = { page_id: await resolvePageId(accessToken) };
    } else if (optimizationGoal === "OFFSITE_CONVERSIONS") {
      const pixelId = await getOrCreatePixelId(accessToken, adAccountId);
      promotedObject = { pixel_id: pixelId, custom_event_type: objective === "OUTCOME_SALES" ? "PURCHASE" : "LEAD" };
      trackingSpecs = [{ "action.type": ["offsite_conversion"], fb_pixel: [pixelId] }];
    }

    const startTime = body.startAt ? Math.floor(new Date(body.startAt).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const endTime = body.endAt ? Math.floor(new Date(body.endAt).getTime() / 1000) : undefined;
    const targeting = buildTargeting(body);
    const placements = buildPlacements(body);

    const externalAdSetId = (
      await graphPost<{ id: string }>(`act_${adAccountId}/adsets`, accessToken, {
        name: body.adSetName,
        campaign_id: campaign.external_campaign_id,
        ...(!isCbo ? budgetField({ budgetType: body.budgetType || "daily", dailyBudgetCents: body.dailyBudgetCents, lifetimeBudgetCents: body.lifetimeBudgetCents }) : {}),
        start_time: startTime,
        ...(endTime ? { end_time: endTime } : {}),
        billing_event: "IMPRESSIONS",
        optimization_goal: optimizationGoal,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting,
        ...placements,
        ...(optimizationGoal === "LEAD_GENERATION" ? { destination_type: "ON_AD" } : {}),
        ...(promotedObject ? { promoted_object: promotedObject } : {}),
        ...(trackingSpecs ? { tracking_specs: trackingSpecs } : {}),
        status: "PAUSED",
      })
    ).id;

    const adSetRow = await CampaignsService.createAdSet({
      business_id: campaign.business_id,
      campaign_id: campaign.id,
      name: body.adSetName,
      status: "paused",
      daily_budget_cents: !isCbo && (body.budgetType || "daily") === "daily" ? body.dailyBudgetCents ?? null : null,
      lifetime_budget_cents: !isCbo && body.budgetType === "lifetime" ? body.lifetimeBudgetCents ?? null : null,
      targeting,
      placements: { mode: body.placementsMode || "advantage_plus", ...placements },
      optimization_goal: optimizationGoal,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      start_at: body.startAt || new Date().toISOString(),
      end_at: body.endAt || null,
      external_adset_id: externalAdSetId,
    });

    return NextResponse.json({ success: true, adSetId: adSetRow.id, externalAdSetId });
  } catch (error: any) {
    console.error("[META_ADS_ADD_AD_SET]", error);
    return NextResponse.json({ error: error.message || "Failed to add ad set" }, { status: 500 });
  }
}
