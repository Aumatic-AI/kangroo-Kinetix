"use client";
import { useState } from "react";
import { Megaphone, Send, Share2 } from "lucide-react";
import { useRootDashboard, RootDashboardRange } from "../hooks/useDashboard";
import { KpiRow } from "../components/KpiRow";
import { AcquisitionFunnel } from "../components/AcquisitionFunnel";
import { LeadsBySource } from "../components/LeadsBySource";
import { ReachTrend } from "../components/ReachTrend";
import { ModuleTrendCard } from "../components/ModuleTrendCard";
import { ChannelTable } from "../components/ChannelTable";
import {
  ACCENT,
  Card,
  KpiRowSkeleton,
  SectionTitleSkeleton,
  BarRowsSkeleton,
  AreaChartSkeleton,
  ModuleCardSkeleton,
  TableSkeleton,
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
          <KpiRowSkeleton count={8} cols="grid-cols-2 lg:grid-cols-4" compact />

          <Card>
            <SectionTitleSkeleton titleWidth="w-40" trailing />
            <BarRowsSkeleton rows={3} height={170} labelWidth="w-14" />
          </Card>

          <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-5">
            <Card>
              <SectionTitleSkeleton titleWidth="w-36" />
              <AreaChartSkeleton height={220} legendItems={2} />
            </Card>
            <Card>
              <SectionTitleSkeleton titleWidth="w-28" trailing />
              <AreaChartSkeleton height={220} legendItems={2} />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <ModuleCardSkeleton />
            <ModuleCardSkeleton />
            <ModuleCardSkeleton />
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="p-5 pb-0">
              <SectionTitleSkeleton titleWidth="w-40" />
            </div>
            <div className="px-5 pb-5">
              <TableSkeleton rows={3} cols={4} />
            </div>
          </Card>
        </>
      ) : (
        <>
          <KpiRow kpis={data.kpis} />

          <AcquisitionFunnel stages={data.funnel} />

          <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-5">
            <LeadsBySource data={data.leadsBySource} />
            <ReachTrend data={data.reachTrend} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <ModuleTrendCard
              icon={Megaphone}
              title="Meta Ads"
              href={ROUTES.META_ADS.DASHBOARD}
              accent={ACCENT.purple}
              headline={data.moduleTrends.meta.headline}
              headlineLabel={data.moduleTrends.meta.headlineLabel}
              secondary={data.moduleTrends.meta.secondary}
              data={data.moduleTrends.meta.data}
            />
            <ModuleTrendCard
              icon={Send}
              title="Outreach"
              href={ROUTES.OUTREACH.DASHBOARD}
              accent={ACCENT.blue}
              headline={data.moduleTrends.outreach.headline}
              headlineLabel={data.moduleTrends.outreach.headlineLabel}
              secondary={data.moduleTrends.outreach.secondary}
              data={data.moduleTrends.outreach.data}
            />
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
          </div>

          <ChannelTable rows={data.channelTable} />
        </>
      )}
    </div>
  );
}
