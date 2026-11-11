"use client";
import { useState } from "react";
import { Share2 } from "lucide-react";
import { useRootDashboard, RootDashboardRange } from "../hooks/useDashboard";
import { KpiRow } from "../components/KpiRow";
import { ReachTrend } from "../components/ReachTrend";
import { ModuleTrendCard } from "../components/ModuleTrendCard";
import {
  ACCENT,
  Card,
  KpiRowSkeleton,
  SectionTitleSkeleton,
  AreaChartSkeleton,
  ModuleCardSkeleton,
} from "@/components/global/DashboardKit";
import { ROUTES } from "@/config/routes";

const RANGES: { value: RootDashboardRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
];

export function DashboardPage() {
  const [range, setRange] = useState<RootDashboardRange>("30d");
  const { data, isLoading } = useRootDashboard(range);

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
          <KpiRowSkeleton count={3} cols="grid-cols-2 lg:grid-cols-3" compact />

          <Card>
            <SectionTitleSkeleton titleWidth="w-36" />
            <AreaChartSkeleton height={220} legendItems={1} />
          </Card>

          <ModuleCardSkeleton />
        </>
      ) : (
        <>
          <KpiRow kpis={data.kpis} />

          <ReachTrend data={data.reachTrend} />

          <ModuleTrendCard
            icon={Share2}
            title="Social Media"
            href={ROUTES.SOCIAL.DASHBOARD}
            accent={ACCENT.green}
            headline={data.moduleTrends.social.headline}
            headlineLabel={data.moduleTrends.social.headlineLabel}
            secondary={data.moduleTrends.social.secondary}
            data={data.moduleTrends.social.data}
          />
        </>
      )}
    </div>
  );
}
