import { NextResponse } from "next/server";
import { LeadsService } from "@/modules/outreach/services/outreach.service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const history = await LeadsService.getCampaignHistory(id);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("[OUTREACH_LEAD_HISTORY]", error);
    const message = error instanceof Error ? error.message : "Failed to load lead history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
