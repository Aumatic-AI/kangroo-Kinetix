import { NextResponse } from "next/server";
import { LeadsService } from "@/modules/outreach/services/outreach.service";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await LeadsService.deleteLead(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[OUTREACH_LEADS_DELETE]", error);
    return NextResponse.json({ error: error.message || "Failed to delete lead" }, { status: 500 });
  }
}
