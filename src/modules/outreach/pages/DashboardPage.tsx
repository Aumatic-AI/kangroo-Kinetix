"use client";
import { useOutreachDashboard } from "../hooks/useDashboard";
import { KpiRow } from "../components/dashboard/KpiRow";
import { CampaignBreakdown } from "../components/dashboard/CampaignBreakdown";
import { LeadStatusBreakdown } from "../components/dashboard/LeadStatusBreakdown";
import { SendsTrend } from "../components/dashboard/SendsTrend";
import { Card, KpiRowSkeleton, SectionTitleSkeleton, AreaChartSkeleton, BarRowsSkeleton } from "@/components/global/DashboardKit";

export function DashboardPage() {
  const { data, isLoading } = useOutreachDashboard();

  if (isLoading || !data) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        <KpiRowSkeleton count={6} cols="grid-cols-3 lg:grid-cols-6" compact />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <SectionTitleSkeleton titleWidth="w-28" />
            <AreaChartSkeleton height={200} />
          </Card>
          <Card>
            <SectionTitleSkeleton titleWidth="w-32" />
            <BarRowsSkeleton rows={7} height={220} labelWidth="w-20" />
          </Card>
        </div>

        <Card>
          <SectionTitleSkeleton titleWidth="w-44" />
          <AreaChartSkeleton height={220} legendItems={3} />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <KpiRow kpis={data.kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SendsTrend data={data.sendsTrend} />
        <LeadStatusBreakdown breakdown={data.leadStatusBreakdown} />
      </div>

      <CampaignBreakdown campaigns={data.campaignBreakdown} />
    </div>
  );
}
