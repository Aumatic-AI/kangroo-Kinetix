import { NextResponse } from "next/server";
import { OutreachCampaignsService } from "@/modules/outreach/services/outreach.service";
import { inngest } from "@/services/inngest/client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const campaign = await OutreachCampaignsService.getCampaignById(id);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (!campaign.generated_body) return NextResponse.json({ error: "This campaign has no content yet" }, { status: 400 });
    if (campaign.status !== "active") return NextResponse.json({ error: "Approve this campaign before sending" }, { status: 400 });

    await inngest.send({
      name: "outreach/send-campaign",
      data: { campaignId: id, listId: body.listId || campaign.list_id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[OUTREACH_CAMPAIGN_SEND]", error);
    return NextResponse.json({ error: error.message || "Failed to send campaign" }, { status: 500 });
  }
}
