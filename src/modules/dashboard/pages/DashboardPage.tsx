"use client";
import { useState } from "react";
import { useDashboard } from "../hooks/useDashboard";
import { DASHBOARD_RANGES, type DashboardRange } from "../types";
import { KpiRow } from "../components/KpiRow";
import { ImpressionsTrend } from "../components/ImpressionsTrend";
import { EngagementBreakdown } from "../components/EngagementBreakdown";
import { PlatformComparison } from "../components/PlatformComparison";
import { ImpressionsByPlatform } from "../components/ImpressionsByPlatform";
import { PlatformHealth } from "../components/PlatformHealth";
import { AudienceDemographics } from "../components/AudienceDemographics";
import { AttentionBar } from "../components/AttentionBar";
import { AutomationCard } from "../components/AutomationCard";
import {
  Card, KpiRowSkeleton, SectionTitleSkeleton, AreaChartSkeleton, PieChartSkeleton, ProportionalListSkeleton, IconGridSkeleton, RowListSkeleton,
} from "@/components/global/DashboardKit";

const RANGE_OPTIONS = Object.entries(DASHBOARD_RANGES) as [DashboardRange, (typeof DASHBOARD_RANGES)[DashboardRange]][];

/**
 * The one Dashboard: social performance (live from Upload-Post) and what content
 * automation is doing (from the database), with anything that needs a person on
 * top. Replaces the separate Social Analytics page (`/social` redirects here).
 * The range scopes impressions; the other KPIs are what each platform reports now.
 */
export function DashboardPage() {
  const [range, setRange] = useState<DashboardRange>("30d");
  const { data, isLoading, error } = useDashboard(range);
  const rangeLabel = DASHBOARD_RANGES[range].label;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-text">Dashboard</h2>
          <p className="text-sm text-muted mt-1">Social performance across your connected accounts, and what content automation is doing.</p>
        </div>
        <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
          {RANGE_OPTIONS.map(([value, r]) => (
            <button
              key={value}
              onClick={() => setRange(value)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${range === value ? "bg-background text-text shadow-sm" : "text-muted hover:text-text"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="py-16 text-center border border-default rounded-2xl border-dashed">
          <p className="text-sm text-danger font-medium">{error.message}</p>
        </div>
      ) : isLoading || !data ? (
        <>
          <KpiRowSkeleton count={5} cols="grid-cols-2 lg:grid-cols-5" tint />
          <div className="grid sm:grid-cols-1 md:grid-cols-[7fr_3fr] gap-5">
            <Card><SectionTitleSkeleton titleWidth="w-28" /><AreaChartSkeleton height={220} /></Card>
            <Card><SectionTitleSkeleton titleWidth="w-40" /><PieChartSkeleton legendRows={4} /></Card>
          </div>
          <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-5">
            <Card><SectionTitleSkeleton titleWidth="w-20" trailing /><ProportionalListSkeleton rows={4} /></Card>
            <Card><SectionTitleSkeleton titleWidth="w-44" /><ProportionalListSkeleton rows={4} /></Card>
          </div>
          <Card><SectionTitleSkeleton titleWidth="w-44" /><RowListSkeleton rows={4} /></Card>
          <Card><SectionTitleSkeleton titleWidth="w-32" /><IconGridSkeleton items={6} /></Card>
        </>
      ) : (
        <>
          <AttentionBar items={data.attention} />

          <KpiRow kpis={data.analytics.kpis} rangeLabel={rangeLabel} />

          <div className="grid sm:grid-cols-1 md:grid-cols-[7fr_3fr] gap-5">
            <ImpressionsTrend data={data.analytics.impressionsTrend} rangeLabel={rangeLabel} />
            <EngagementBreakdown data={data.analytics.engagementBreakdown} />
          </div>

          <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-5">
            <PlatformComparison platforms={data.analytics.platformComparison} />
            <ImpressionsByPlatform data={data.analytics.impressionsByPlatform} rangeLabel={rangeLabel} />
          </div>

          <AutomationCard automation={data.automation} error={data.automationError} />

          <PlatformHealth platforms={data.analytics.platformHealth} />

          {data.analytics.audienceDemographics && <AudienceDemographics demographics={data.analytics.audienceDemographics} />}
        </>
      )}
    </div>
  );
}
