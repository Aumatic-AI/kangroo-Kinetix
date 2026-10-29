import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { LeadsService, LeadStatus, LEAD_STATUSES } from "@/modules/meta-ads/services/leads.service";
import { sendLeadStatusEvent } from "@/services/meta/conversions-api";

/**
 * Changes a lead's status in our own DB, then best-effort reports it to
 * Meta's Conversions API for CRM (see conversions-api.ts) so it's on record
 * for whenever a campaign is switched to the "Conversion Leads"
 * optimization goal. The local status change always succeeds even if the
 * Meta push fails or META_CONVERSIONS_DATASET_ID isn't configured yet.
 */
export async function POST(request: Request) {
  try {
    const { id, status } = (await request.json()) as { id: string; status: string };
    if (!id || !LEAD_STATUSES.includes(status as LeadStatus)) {
      return NextResponse.json({ error: "id and a valid status are required" }, { status: 400 });
    }

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const { data: lead, error } = await supabase.from("leads").select("meta_lead_id").eq("id", id).single();
    if (error || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    await LeadsService.updateStatus(supabase, id, status as LeadStatus);

    try {
      await sendLeadStatusEvent(lead.meta_lead_id, status);
    } catch (metaError) {
      console.error("[META_ADS_LEAD_STATUS] Meta push failed, local status still updated", metaError);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[META_ADS_LEAD_STATUS]", error);
    return NextResponse.json({ error: error.message || "Failed to update lead status" }, { status: 500 });
  }
}
