import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { estimateUsageCost, UsageCounts, UsageEstimate } from "@/lib/costEstimates";

export const dynamic = "force-dynamic";

export interface UsageResponse {
  month: string; // YYYY-MM
  periodLabel: string;
  counts: {
    imageAdCount: number;
    videoAdCount: number;
    studioSessionCount: number;
    studioImageCount: number;
    outreachLeadCount: number;
  };
  estimate: UsageEstimate;
}

function sceneCountOf(scriptHolder: unknown): number {
  if (scriptHolder && typeof scriptHolder === "object" && Array.isArray((scriptHolder as { script?: unknown }).script)) {
    return ((scriptHolder as { script: unknown[] }).script).length;
  }
  return 7; // the app's own default duration's floor scene count, used only if a row is missing its script
}

function isChatEdit(entry: unknown): boolean {
  return !!entry && typeof entry === "object" && typeof (entry as { action?: unknown }).action === "string" && (entry as { action: string }).action.startsWith("chat edit:");
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
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);

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

    const [{ data: creativeRows }, { count: studioSessionCount }, { data: assetRows }, { count: outreachLeadCount }] = await Promise.all([
      supabase
        .from("meta_ad_creatives")
        .select("type, studio_session_id, ad_script, revision_history")
        .eq("business_id", businessId)
        .gte("created_at", startOfMonth.toISOString())
        .lt("created_at", startOfNextMonth.toISOString()),
      supabase
        .from("studio_sessions")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .gte("created_at", startOfMonth.toISOString())
        .lt("created_at", startOfNextMonth.toISOString()),
      supabase
        .from("media_assets")
        .select("type, metadata")
        .eq("business_id", businessId)
        .eq("source", "ai_generated")
        .gte("created_at", startOfMonth.toISOString())
        .lt("created_at", startOfNextMonth.toISOString()),
      supabase
        .from("outreach_leads")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .gte("created_at", startOfMonth.toISOString())
        .lt("created_at", startOfNextMonth.toISOString()),
    ]);

    let imageAdCount = 0;
    let studioImageCount = 0;
    const videoSceneCounts: number[] = [];

    for (const row of creativeRows || []) {
      if (row.type === "image") {
        if (row.studio_session_id) {
          studioImageCount += 1; // the base generated image
          const history = Array.isArray(row.revision_history) ? row.revision_history : [];
          studioImageCount += history.filter(isChatEdit).length;
        } else {
          imageAdCount += 1;
        }
      } else if (row.type === "video") {
        videoSceneCounts.push(sceneCountOf(row.ad_script));
      }
    }

    for (const asset of assetRows || []) {
      if (asset.type === "image") {
        imageAdCount += 1;
      } else if (asset.type === "video") {
        videoSceneCounts.push(sceneCountOf(asset.metadata));
      }
    }

    const counts: UsageCounts = {
      imageAdCount,
      studioSessionCount: studioSessionCount || 0,
      studioImageCount,
      outreachLeadCount: outreachLeadCount || 0,
      videoSceneCounts,
    };

    const estimate = estimateUsageCost(counts);

    const response: UsageResponse = {
      month,
      periodLabel,
      counts: {
        imageAdCount,
        videoAdCount: videoSceneCounts.length,
        studioSessionCount: studioSessionCount || 0,
        studioImageCount,
        outreachLeadCount: outreachLeadCount || 0,
      },
      estimate,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[USAGE_GET]", error);
    return NextResponse.json({ error: "Failed to load usage" }, { status: 500 });
  }
}

function emptyResponse(month: string, periodLabel: string): UsageResponse {
  const counts: UsageCounts = { imageAdCount: 0, studioSessionCount: 0, studioImageCount: 0, outreachLeadCount: 0, videoSceneCounts: [] };
  return {
    month,
    periodLabel,
    counts: { imageAdCount: 0, videoAdCount: 0, studioSessionCount: 0, studioImageCount: 0, outreachLeadCount: 0 },
    estimate: estimateUsageCost(counts),
  };
}
