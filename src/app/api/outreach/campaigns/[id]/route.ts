import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { OutreachCampaignsService, LeadListsService } from "@/modules/outreach/services/outreach.service";
import { OutreachCampaignDetail } from "@/modules/outreach/types/outreach.types";
import { getOutreachRevisionPrompt } from "@/prompts/outreach";
import { aiOrchestrator } from "@/services/ai/orchestrator";
import { InstantlyService } from "@/services/instantly";

/** One call, one merge: our own campaign row, its list's name, and its live
 * Instantly analytics, all fetched and merged server-side (see
 * getCampaignAnalyticsEntry) into exactly the fields the Campaign Detail
 * page renders — instead of the page making three separate calls itself. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const campaign = await OutreachCampaignsService.getCampaignById(id);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const [listIds, entry] = await Promise.all([
      OutreachCampaignsService.getCampaignListIds(campaign),
      OutreachCampaignsService.getCampaignAnalyticsEntry(campaign),
    ]);
    const lists = await Promise.all(listIds.map((id) => LeadListsService.getListById(id)));
    const listName = lists.filter(Boolean).map((l) => l!.name).join(", ") || "—";

    const detail: OutreachCampaignDetail = {
      id: campaign.id,
      name: campaign.name,
      serviceType: campaign.service_type,
      targetRegion: campaign.target_region,
      dailyLimit: campaign.daily_limit,
      goal: campaign.goal,
      tone: campaign.tone,
      ctaText: campaign.cta_text,
      ctaLink: campaign.cta_link,
      createdAt: campaign.created_at,
      listName,
      generatedBody: campaign.generated_body,
      status: entry.value,
      statusLabel: entry.label,
      statusTone: entry.tone,
      statusReason: entry.reason,
      sent: entry.sent,
      opened: entry.opened,
      openRate: entry.openRate,
      replied: entry.replied,
      replyRate: entry.replyRate,
      clicked: entry.clicked,
      clickRate: entry.clickRate,
      bounced: entry.bounced,
      bounceRate: entry.bounceRate,
    };

    return NextResponse.json({ campaign: detail });
  } catch (error: any) {
    console.error("[OUTREACH_CAMPAIGN_GET]", error);
    return NextResponse.json({ error: error.message || "Failed to load campaign" }, { status: 500 });
  }
}

/** feedback -> AI regenerates. approve:true -> status becomes 'active',
 * which is what step 5 (send) checks before it will send anything —
 * whatever is on this row at that moment is exactly what gets sent, never
 * re-derived separately (the legacy app's single biggest bug). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = (await createClient()) as SupabaseClient<Database>;

    const campaign = await OutreachCampaignsService.getCampaignById(id);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    if (body.manualEdit) {
      const generatedBody = { subject: body.manualEdit.subject, body: body.manualEdit.body };
      await OutreachCampaignsService.updateCampaign(id, {
        generated_subject: generatedBody.subject,
        generated_body: generatedBody,
      });
      return NextResponse.json({ success: true, generatedBody });
    }

    if (body.feedback?.trim()) {
      const business = await MetaAdsService.getBusinessById(supabase, campaign.business_id);
      if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

      const services: { name: string; description?: string | null }[] = business.services || [];
      const serviceDescription = services.find((s) => s.name === campaign.service_type)?.description || undefined;

      const prompt = getOutreachRevisionPrompt(
        business,
        { goal: campaign.goal || "", tone: campaign.tone || "", messageBrief: campaign.message_brief || "", serviceType: campaign.service_type || "", serviceDescription, targetRegion: campaign.target_region || "", ctaText: campaign.cta_text || undefined, ctaLink: campaign.cta_link || undefined },
        campaign.generated_body,
        body.feedback.trim()
      );
      const responseText = (await aiOrchestrator.executeTask("text", prompt.user, "openai", { systemPrompt: prompt.system })) as string;
      const generatedBody = JSON.parse(responseText.replace(/```json\n?|\n?```/g, "").trim());

      await OutreachCampaignsService.updateCampaign(id, {
        generated_subject: generatedBody.subject,
        generated_body: generatedBody,
        revision_history: campaign.generated_body
          ? [...(campaign.revision_history || []), { content: campaign.generated_body, feedback: body.feedback.trim(), created_at: new Date().toISOString() }]
          : campaign.revision_history || [],
      });

      return NextResponse.json({ success: true, generatedBody });
    }

    if (body.pause) {
      if (campaign.external_campaign_id) {
        await InstantlyService.pauseCampaign(campaign.external_campaign_id);
      }
      await OutreachCampaignsService.updateCampaign(id, { status: "paused" });
      return NextResponse.json({ success: true });
    }

    // Instantly's own docs title this same endpoint "Activate(start), or
    // resume a campaign" — one action serves both, confirmed against their
    // API reference. No separate resume call exists.
    if (body.resume) {
      if (campaign.external_campaign_id) {
        await InstantlyService.activateCampaign(campaign.external_campaign_id);
      }
      await OutreachCampaignsService.updateCampaign(id, { status: "active" });
      return NextResponse.json({ success: true });
    }

    await OutreachCampaignsService.updateCampaign(id, {
      ...(body.approve ? { status: "active" } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.listId !== undefined ? { list_id: body.listId } : {}),
      ...(body.dailyLimit !== undefined ? { daily_limit: body.dailyLimit } : {}),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[OUTREACH_CAMPAIGN_UPDATE]", error);
    return NextResponse.json({ error: error.message || "Failed to update campaign" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await OutreachCampaignsService.deleteCampaign(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[OUTREACH_CAMPAIGN_DELETE]", error);
    return NextResponse.json({ error: error.message || "Failed to delete campaign" }, { status: 500 });
  }
}
