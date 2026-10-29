"use client";
import { useState } from "react";
import { useMetaAdsDashboard, MetaAdsDashboardRange } from "../hooks/useDashboard";
import { KpiRow } from "../components/dashboard/KpiRow";
import { SpendTrend } from "../components/dashboard/SpendTrend";
import { ScoreDistribution } from "../components/dashboard/ScoreDistribution";
import { Card, KpiRowSkeleton, SectionTitleSkeleton, AreaChartSkeleton, BarRowsSkeleton } from "@/components/global/DashboardKit";

const RANGES: { value: MetaAdsDashboardRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

export function Dashboard() {
  const [range, setRange] = useState<MetaAdsDashboardRange>("30d");
  const { data, isLoading } = useMetaAdsDashboard(range);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      <div className="flex justify-end">
        <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${range === r.value ? "bg-background text-text shadow-sm" : "text-muted hover:text-text"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <>
          <KpiRowSkeleton count={3} cols="grid-cols-3" compact />

          <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-5">
            <Card>
              <SectionTitleSkeleton titleWidth="w-20" />
              <AreaChartSkeleton height={200} />
            </Card>
            <Card>
              <SectionTitleSkeleton titleWidth="w-40" trailing />
              <BarRowsSkeleton rows={5} height={190} />
            </Card>
          </div>
        </>
      ) : (
        <>
          <KpiRow kpis={data.kpis} />

          <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-5">
            <SpendTrend data={data.spendTrend} rangeDays={data.rangeDays} />
            <ScoreDistribution buckets={data.scoreBuckets} />
          </div>
        </>
      )}
    </div>
  );
}
