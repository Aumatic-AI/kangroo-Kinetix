import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { OutreachCampaignsService } from "@/modules/outreach/services/outreach.service";
import { MetaLeadsImportService } from "@/modules/outreach/services/meta-leads-import.service";
import { OutreachCampaignListItem } from "@/modules/outreach/types/outreach.types";
import { getOutreachDraftPrompt } from "@/prompts/outreach";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { paginationMeta, PAGE_SIZE_COMPACT } from "@/lib/pagination";

/** One call, one merge: fetches our own campaign rows and their live
 * Instantly analytics server-side (see getCampaignsWithAnalytics), and
 * returns only the fields the Campaigns table actually renders — not a
 * second endpoint the client has to also call and merge itself. Paginating
 * the DB query also directly cuts the per-campaign outreach_campaign_leads
 * count query getCampaignsWithAnalytics runs for active campaigns, since
 * it now only loops over this page's rows. */
export async function GET(request: NextRequest) {
  try {
    const page = Number(request.nextUrl.searchParams.get("page")) || 1;
    const limit = Number(request.nextUrl.searchParams.get("limit")) || PAGE_SIZE_COMPACT;

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json({ campaigns: [], ...paginationMeta(0, page, limit) });

    const { rows, total } = await OutreachCampaignsService.getCampaignsWithAnalytics(businessId, { page, limit });
    const campaigns: OutreachCampaignListItem[] = rows.map(({ campaign, entry }) => ({
      id: campaign.id,
      name: campaign.name,
      goal: campaign.goal,
      externalCampaignId: campaign.external_campaign_id,
      status: entry.value,
      statusLabel: entry.label,
      statusTone: entry.tone,
      statusReason: entry.reason,
      sent: entry.sent,
      opened: entry.opened,
      replied: entry.replied,
    }));

    return NextResponse.json({ campaigns, ...paginationMeta(total, page, limit) });
  } catch (error: any) {
    console.error("[OUTREACH_CAMPAIGNS_LIST]", error);
    return NextResponse.json({ error: error.message || "Failed to load campaigns" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const listIds: string[] = Array.isArray(body.listIds) ? body.listIds : [];
    const metaCampaignNames: string[] = Array.isArray(body.metaCampaignNames) ? body.metaCampaignNames : [];
    if (!body.name?.trim() || (listIds.length === 0 && metaCampaignNames.length === 0) || !body.serviceType || !body.targetRegion || !body.goal?.trim() || !body.messageBrief?.trim()) {
      return NextResponse.json({ error: "Name, at least one list, service type, target region, goal, and message brief are all required" }, { status: 400 });
    }

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json({ error: "No business configured" }, { status: 400 });

    const business = await MetaAdsService.getBusinessById(supabase, businessId);
    if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    const services: { name: string; description?: string | null }[] = business.services || [];
    const serviceDescription = services.find((s) => s.name === body.serviceType)?.description || undefined;

    const input = {
      goal: body.goal.trim(),
      tone: body.tone || "Friendly and professional",
      messageBrief: body.messageBrief.trim(),
      serviceType: body.serviceType,
      serviceDescription,
      targetRegion: body.targetRegion,
      ctaText: body.ctaText?.trim() || undefined,
      ctaLink: body.ctaLink?.trim() || undefined,
    };

    // Meta-campaign entries get imported into a real list right here, at
    // creation time — not before (see MetaLeadsImportService's own comment).
    const importedListIds: string[] = [];
    for (const campaignName of metaCampaignNames) {
      const result = await MetaLeadsImportService.importCampaignLeads(businessId, campaignName);
      importedListIds.push(result.listId);
    }
    const allListIds = Array.from(new Set([...listIds, ...importedListIds]));

    const campaign = await OutreachCampaignsService.createCampaign({
      business_id: businessId,
      list_id: allListIds[0],
      name: body.name.trim(),
      goal: input.goal,
      tone: input.tone,
      message_brief: input.messageBrief,
      service_type: input.serviceType,
      target_region: input.targetRegion,
      cta_text: input.ctaText || null,
      cta_link: input.ctaLink || null,
      status: "draft",
      daily_limit: Number(body.dailyLimit) || business.outreach_settings?.daily_limit || 50,
    });

    await OutreachCampaignsService.setCampaignLists(campaign.id, allListIds);

    const prompt = getOutreachDraftPrompt(business, input);
    const responseText = (await aiOrchestrator.executeTask("text", prompt.user, "openai", { systemPrompt: prompt.system })) as string;
    const generatedBody = JSON.parse(responseText.replace(/```json\n?|\n?```/g, "").trim());

    await OutreachCampaignsService.updateCampaign(campaign.id, {
      generated_subject: generatedBody.subject,
      generated_body: generatedBody,
    });

    return NextResponse.json({ success: true, campaign: { ...campaign, generated_subject: generatedBody.subject, generated_body: generatedBody } });
  } catch (error: any) {
    console.error("[OUTREACH_CAMPAIGNS_CREATE]", error);
    return NextResponse.json({ error: error.message || "Failed to generate campaign" }, { status: 500 });
  }
}
