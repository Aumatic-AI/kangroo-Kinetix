"use client";
import { useSocialDashboard } from "../hooks/useDashboard";
import { KpiRow } from "../components/dashboard/KpiRow";
import { ImpressionsTrend } from "../components/dashboard/ImpressionsTrend";
import { ImpressionsByPlatform } from "../components/dashboard/ImpressionsByPlatform";
import { PlatformComparison } from "../components/dashboard/PlatformComparison";
import { EngagementBreakdown } from "../components/dashboard/EngagementBreakdown";
import { PlatformHealth } from "../components/dashboard/PlatformHealth";
import { AudienceDemographics } from "../components/dashboard/AudienceDemographics";
import { Card, KpiRowSkeleton, SectionTitleSkeleton, AreaChartSkeleton, PieChartSkeleton, ProportionalListSkeleton, IconGridSkeleton } from "@/components/global/DashboardKit";

export function DashboardPage() {
  const { data, isLoading } = useSocialDashboard();

  if (isLoading || !data) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-10">
        <KpiRowSkeleton count={5} cols="grid-cols-2 lg:grid-cols-5" tint />

        <div className="grid sm:grid-cols-1 md:grid-cols-[7fr_3fr] gap-5">
          <Card>
            <SectionTitleSkeleton titleWidth="w-28" />
            <AreaChartSkeleton height={220} />
          </Card>
          <Card>
            <SectionTitleSkeleton titleWidth="w-40" />
            <PieChartSkeleton legendRows={4} />
          </Card>
        </div>

        <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <SectionTitleSkeleton titleWidth="w-20" trailing />
            <ProportionalListSkeleton rows={4} />
          </Card>
          <Card>
            <SectionTitleSkeleton titleWidth="w-44" />
            <ProportionalListSkeleton rows={4} />
          </Card>
        </div>

        <Card>
          <SectionTitleSkeleton titleWidth="w-32" />
          <IconGridSkeleton items={6} />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <KpiRow kpis={data.kpis} />

      <div className="grid sm:grid-cols-1 md:grid-cols-[7fr_3fr] gap-5">
        <ImpressionsTrend data={data.impressionsTrend} />
        <EngagementBreakdown data={data.engagementBreakdown} />
      </div>

      <div className="grid sm:grid-cols-1 md:grid-cols-2 gap-5">
        <PlatformComparison platforms={data.platformComparison} />
        <ImpressionsByPlatform data={data.impressionsByPlatform} />
      </div>

      <PlatformHealth platforms={data.platformHealth} />

      {data.audienceDemographics && <AudienceDemographics demographics={data.audienceDemographics} />}
    </div>
  );
}
