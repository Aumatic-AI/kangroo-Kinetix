import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { LeadsService } from "@/modules/outreach/services/outreach.service";

export async function GET(request: NextRequest) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json({ leads: [], count: 0 });

    const { searchParams } = request.nextUrl;
    const { leads, count } = await LeadsService.getLeads(
      businessId,
      {
        listId: searchParams.get("listId") || undefined,
        listIds: searchParams.get("listIds")?.split(",").filter(Boolean),
        search: searchParams.get("search") || undefined,
        status: (searchParams.get("status") as any) || undefined,
        excludeStatuses: searchParams.get("excludeStatuses")?.split(",").filter(Boolean) as any,
      },
      { page: Number(searchParams.get("page")) || 1, limit: Number(searchParams.get("limit")) || 50 }
    );

    return NextResponse.json({ leads, count });
  } catch (error: any) {
    console.error("[OUTREACH_LEADS_LIST]", error);
    return NextResponse.json({ error: error.message || "Failed to load leads" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json({ error: "No business configured" }, { status: 400 });

    const lead = await LeadsService.createLead({
      business_id: businessId,
      email: body.email.trim(),
      first_name: body.firstName || null,
      last_name: body.lastName || null,
      phone: body.phone || null,
      company: body.company || null,
      list_id: body.listId || null,
      source: "manual",
    });

    return NextResponse.json({ success: true, lead });
  } catch (error: any) {
    console.error("[OUTREACH_LEADS_CREATE]", error);
    return NextResponse.json({ error: error.message || "Failed to create lead" }, { status: 500 });
  }
}
