import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { getFirstBusinessId } from "@/lib/business";
import { estimateUsageCost, UsageCounts, UsageEstimate } from "@/lib/costEstimates";

export const dynamic = "force-dynamic";

export interface UsageResponse {
  month: string; // YYYY-MM
  periodLabel: string;
  counts: {
    imageAdCount: number;
  };
  estimate: UsageEstimate;
}

/** Real counts (from what's actually in the database for the requested
 * month) combined with the modeled per-unit rates in
 * `src/lib/costEstimates.ts` — this is an ESTIMATE, not a measurement of
 * real provider spend. Kinetix doesn't log actual token/credit usage per
 * call today; see that file's own doc comment for exactly which parts are
 * more or less reliable. Pass `?month=YYYY-MM` to view a past month;
 * defaults to the current month. */
export async function GET(request: NextRequest) {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await getFirstBusinessId(supabase);

    const now = new Date();
    const monthParam = request.nextUrl.searchParams.get("month");
    const monthMatch = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : null;
    const year = monthMatch ? parseInt(monthMatch.slice(0, 4), 10) : now.getUTCFullYear();
    const monthIndex = monthMatch ? parseInt(monthMatch.slice(5, 7), 10) - 1 : now.getUTCMonth();

    const startOfMonth = new Date(Date.UTC(year, monthIndex, 1));
    const startOfNextMonth = new Date(Date.UTC(year, monthIndex + 1, 1));
    const month = `${startOfMonth.getUTCFullYear()}-${String(startOfMonth.getUTCMonth() + 1).padStart(2, "0")}`;
    const periodLabel = startOfMonth.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

    if (!businessId) {
      return NextResponse.json(emptyResponse(month, periodLabel));
    }

    const { data: assetRows } = await supabase
      .from("media_assets")
      .select("type, metadata")
      .eq("business_id", businessId)
      .eq("source", "ai_generated")
      .gte("created_at", startOfMonth.toISOString())
      .lt("created_at", startOfNextMonth.toISOString());

    let imageAdCount = 0;

    for (const asset of assetRows || []) {
      if (asset.type === "image") imageAdCount += 1;
    }

    const counts: UsageCounts = { imageAdCount };

    const estimate = estimateUsageCost(counts);

    const response: UsageResponse = {
      month,
      periodLabel,
      counts: { imageAdCount },
      estimate,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[USAGE_GET]", error);
    return NextResponse.json({ error: "Failed to load usage" }, { status: 500 });
  }
}

function emptyResponse(month: string, periodLabel: string): UsageResponse {
  const counts: UsageCounts = { imageAdCount: 0 };
  return {
    month,
    periodLabel,
    counts: { imageAdCount: 0 },
    estimate: estimateUsageCost(counts),
  };
}
