import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { LeadListsService, LeadsService } from "@/modules/outreach/services/outreach.service";
import { paginationMeta, PAGE_SIZE_COMPACT } from "@/lib/pagination";

/**
 * Lead lists — read-only now that lists are entirely Meta-campaign-derived
 * (see MetaLeadsImportService); nothing creates/renames/deletes a list by
 * hand anymore, so only GET remains.
 *
 * `page`/`limit` are optional: pass neither for the full list, unpaginated.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json({ lists: [] });

    const { searchParams } = request.nextUrl;
    const paginated = searchParams.has("page") || searchParams.has("limit");
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || PAGE_SIZE_COMPACT;

    const { lists, total } = await LeadListsService.getLists(businessId, paginated ? { page, limit } : undefined);
    // Scoped to just this page's lists when paginated, instead of scanning
    // every lead this business owns.
    const leadCounts = await LeadsService.getListLeadCounts(businessId, paginated ? lists.map((l) => l.id) : undefined);

    const payload = { lists: lists.map((l) => ({ ...l, leadCount: leadCounts[l.id] || 0 })) };
    return NextResponse.json(paginated ? { ...payload, ...paginationMeta(total, page, limit) } : payload);
  } catch (error: any) {
    console.error("[OUTREACH_LISTS_LIST]", error);
    return NextResponse.json({ error: error.message || "Failed to load lists" }, { status: 500 });
  }
}
