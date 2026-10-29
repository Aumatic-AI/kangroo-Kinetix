import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { MetaAdsService } from "@/modules/meta-ads/services/meta-ads.service";
import { OutreachCampaignsService } from "@/modules/outreach/services/outreach.service";

export const dynamic = "force-dynamic";

const LEAD_STATUSES = ["new", "contacted", "replied", "interested", "not_interested", "bounced", "do_not_contact"] as const;

interface OutreachDashboardResponse {
  kpis: {
    totalLeads: number;
    activeCampaigns: number;
    totalSent: number;
    openRate: number;
    replyRate: number;
    bounceRate: number;
  };
  campaignBreakdown: { name: string; sent: number; opened: number; replied: number }[];
  leadStatusBreakdown: { status: (typeof LEAD_STATUSES)[number]; count: number }[];
  sendsTrend: { date: string; count: number }[];
}

const EMPTY: OutreachDashboardResponse = {
  kpis: { totalLeads: 0, activeCampaigns: 0, totalSent: 0, openRate: 0, replyRate: 0, bounceRate: 0 },
  campaignBreakdown: [],
  leadStatusBreakdown: LEAD_STATUSES.map((status) => ({ status, count: 0 })),
  sendsTrend: [],
};

function rate(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** Everything the Outreach dashboard renders, in one call — live Instantly
 * delivery data cross-referenced the same way /api/outreach/analytics does
 * (reusing getCampaignsWithAnalytics, not re-deriving it), plus two genuine
 * DB aggregates (lead status mix, daily send volume) that analytics never
 * needed. No prose anywhere — metrics and chart-ready series only. */
export async function GET() {
  try {
    const supabase = (await createClient()) as SupabaseClient<Database>;
    const businessId = await MetaAdsService.getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json(EMPTY);

    const [{ count: totalLeads }, { data: leadStatusRows }, { rows }] = await Promise.all([
      supabase.from("outreach_leads").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      supabase.from("outreach_leads").select("status").eq("business_id", businessId),
      OutreachCampaignsService.getCampaignsWithAnalytics(businessId),
    ]);

    const leadStatusCounts = new Map<string, number>();
    for (const row of leadStatusRows || []) {
      leadStatusCounts.set(row.status, (leadStatusCounts.get(row.status) || 0) + 1);
    }
    const leadStatusBreakdown = LEAD_STATUSES.map((status) => ({ status, count: leadStatusCounts.get(status) || 0 }));

    let activeCampaigns = 0;
    let totalSent = 0;
    let totalOpened = 0;
    let totalReplied = 0;
    let totalBounced = 0;
    const campaignBreakdown: OutreachDashboardResponse["campaignBreakdown"] = [];
    const activeCampaignIds: string[] = [];

    for (const { campaign, entry } of rows) {
      if (entry.value === "sending" || entry.value === "sent") {
        activeCampaigns += entry.value === "sending" ? 1 : 0;
        totalSent += entry.sent;
        totalOpened += entry.opened;
        totalReplied += entry.replied;
        totalBounced += entry.bounced;
        activeCampaignIds.push(campaign.id);
        if (entry.sent > 0) campaignBreakdown.push({ name: campaign.name, sent: entry.sent, opened: entry.opened, replied: entry.replied });
      }
    }
    campaignBreakdown.sort((a, b) => b.sent - a.sent);

    // All-time, like the rest of this page — no fixed lookback window. The
    // earliest day comes straight from the real send history itself (no
    // separate "find the earliest date" query needed), zero-filled day by
    // day up to today so the line never breaks on a day with no sends.
    const sendsTrend: OutreachDashboardResponse["sendsTrend"] = [];
    if (activeCampaignIds.length > 0) {
      const { data: sendRows } = await supabase
        .from("outreach_campaign_leads")
        .select("sent_at")
        .in("outreach_campaign_id", activeCampaignIds)
        .eq("status", "sent")
        .not("sent_at", "is", null);

      const countByDay = new Map<string, number>();
      for (const row of sendRows || []) {
        if (!row.sent_at) continue;
        const day = row.sent_at.slice(0, 10);
        countByDay.set(day, (countByDay.get(day) || 0) + 1);
      }

      const days = [...countByDay.keys()].sort();
      if (days.length > 0) {
        const cursor = new Date(days[0]);
        const today = new Date(new Date().toISOString().slice(0, 10));
        while (cursor <= today) {
          const date = cursor.toISOString().slice(0, 10);
          sendsTrend.push({ date, count: countByDay.get(date) || 0 });
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    const response: OutreachDashboardResponse = {
      kpis: {
        totalLeads: totalLeads || 0,
        activeCampaigns,
        totalSent,
        openRate: rate(totalOpened, totalSent),
        replyRate: rate(totalReplied, totalSent),
        bounceRate: rate(totalBounced, totalSent),
      },
      campaignBreakdown: campaignBreakdown.slice(0, 8),
      leadStatusBreakdown,
      sendsTrend,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[OUTREACH_DASHBOARD]", error);
    return NextResponse.json({ error: error.message || "Failed to load dashboard" }, { status: 500 });
  }
}
