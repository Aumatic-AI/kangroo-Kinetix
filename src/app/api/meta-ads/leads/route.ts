import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { LeadsService } from "@/modules/meta-ads/services/leads.service";
import { paginationMeta, rangeFor, PAGE_SIZE_COMPACT } from "@/lib/pagination";

/**
 * No webhook, and no background cron either — this calls Meta live on
 * every page load (a real, measured 7-8s round trip), so the Leads page
 * never shows data older than "right now". syncFromMeta() only ever
 * upserts (never deletes) into our own `leads` table, so any lead already
 * on record from an earlier sync stays there even if a later Graph API
 * response happens to omit it — reading from `leads` right after syncing
 * is already "both sources combined", not just whatever this one call
 * returns. If the live sync itself fails (Graph API down, META_PAGE_ID/
 * META_PAGE_TOKEN not configured), degrade to whatever's already in the
 * table instead of failing the whole page.
 */
export async function GET(request: NextRequest) {
  try {
    const page = Number(request.nextUrl.searchParams.get("page")) || 1;
    const limit = Number(request.nextUrl.searchParams.get("limit")) || PAGE_SIZE_COMPACT;

    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json({ leads: [], ...paginationMeta(0, page, limit) });

    try {
      await LeadsService.syncFromMeta(supabase, businessId);
    } catch (syncError) {
      console.error("[META_ADS_LEADS_LIST] live sync failed, serving existing data", syncError);
    }

    const [from, to] = rangeFor(page, limit);
    const { data, error, count } = await supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);

    return NextResponse.json({ leads: data || [], ...paginationMeta(count || 0, page, limit) });
  } catch (error: any) {
    console.error("[META_ADS_LEADS_LIST]", error);
    return NextResponse.json({ error: error.message || "Failed to load leads" }, { status: 500 });
  }
}
