import React from "react";
import { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Shared visual primitives for every dashboard (root, Meta Ads, Outreach,
 * Social) — one Card/KpiTile/chart-color system so the four dashboards read
 * as one product instead of four one-off pages. Categorical series always
 * follow this fixed order (never cycled, never re-picked per chart) — it's
 * DESIGN.md's own five tokens (primary/info/success/warning/danger),
 * validated colorblind-safe as a set via the dataviz skill's checker. */
export const ACCENT = {
  purple: { solid: "var(--color-primary)", tint: "var(--color-primary-subtle)" },
  blue: { solid: "var(--color-info)", tint: "#eff6ff" },
  green: { solid: "var(--color-success)", tint: "rgba(20,158,97,0.16)" },
  amber: { solid: "var(--color-warning)", tint: "#fffbeb" },
  red: { solid: "var(--color-danger)", tint: "#fef2f2" },
};

export const CHART_SERIES = [ACCENT.purple.solid, ACCENT.blue.solid, ACCENT.green.solid, ACCENT.amber.solid, ACCENT.red.solid];

export const CHART_TOOLTIP_STYLE = {
  background: "var(--color-background)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 12,
};

/** Recharts' `interval` prop for a date XAxis, scaled to the actual number
 * of points so labels never collide regardless of how long the selected
 * range is — a fixed set of manual thresholds (e.g. "interval 9 past 45
 * points") stops scaling once a range grows past whatever the thresholds
 * anticipated, which is exactly what broke the 180-day "All time" view
 * (~18 labels forced into a ~500px-wide card). This targets a constant
 * number of visible labels for any length instead. */
export function chartTickInterval(pointCount: number, targetLabels = 7): number {
  return Math.max(0, Math.ceil(pointCount / targetLabels) - 1);
}

/** A flat bordered panel — DESIGN.md's real panel idiom (border, not
 * shadow; rounded-lg, not an invented radius), used for every chart/KPI
 * card on a dashboard. */
export function Card({ className = "", style, children }: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className={`bg-background border border-default rounded-lg p-5 ${className}`} style={style}>
      {children}
    </div>
  );
}

export function SectionTitle({ icon: Icon, title, accent = ACCENT.purple, trailing }: { icon: LucideIcon; title: string; accent?: { solid: string; tint: string }; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent.tint, color: accent.solid }}>
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="text-[15px] font-bold text-text">{title}</h3>
      </div>
      {trailing}
    </div>
  );
}

export function KpiTile({
  icon: Icon,
  accent,
  value,
  label,
  sublabel,
  compact = false,
  tint = false,
}: {
  icon: LucideIcon;
  accent: { solid: string; tint: string };
  value: React.ReactNode;
  label: string;
  sublabel?: string;
  compact?: boolean;
  /** Label row on top (small icon + label together), one big number below,
   * full width — a plain, minimal stat-card layout instead of the default's
   * icon-then-stacked-text. No tint background or colored border; the icon
   * is the only accent, everything else is neutral ink. */
  tint?: boolean;
}) {
  if (compact) {
    return (
      <Card className="flex items-start gap-2.5 p-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent.tint, color: accent.solid }}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-text tabular-nums leading-none">{value}</p>
          <p className="text-[11px] font-medium text-muted mt-1 leading-snug">{label}</p>
        </div>
      </Card>
    );
  }

  if (tint) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: accent.tint, color: accent.solid }}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</p>
        </div>
        <p className="text-3xl font-bold text-text tabular-nums leading-none">{value}</p>
        {sublabel && <p className="text-xs text-muted mt-2">{sublabel}</p>}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent.tint, color: accent.solid }}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-2xl font-bold text-text tabular-nums leading-none">{value}</p>
        <p className="text-xs font-medium text-muted mt-1.5">{label}</p>
        {sublabel && <p className="text-[11px] text-muted/70 mt-0.5">{sublabel}</p>}
      </div>
    </Card>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="text-center py-16 text-muted border border-default rounded-2xl border-dashed text-sm">{message}</div>;
}

/** Every skeleton below mirrors one real component's exact DOM shape
 * (same Card, same icon-badge + title row, same body layout) instead of a
 * single blank rectangle per section — so the loading state never jumps
 * or resizes once real data replaces it. Compose these to match whatever
 * a given dashboard page actually renders. */

/** One KpiTile, in whichever of its three real variants is showing. */
export function KpiTileSkeleton({ compact = false, tint = false }: { compact?: boolean; tint?: boolean }) {
  if (compact) {
    return (
      <Card className="flex items-start gap-2.5 p-3">
        <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-5 w-14 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
        </div>
      </Card>
    );
  }
  if (tint) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="w-6 h-6 rounded-md shrink-0" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
        <Skeleton className="h-8 w-20 rounded" />
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-3">
      <Skeleton className="w-9 h-9 rounded-lg" />
      <div className="space-y-1.5">
        <Skeleton className="h-7 w-16 rounded" />
        <Skeleton className="h-3 w-20 rounded" />
      </div>
    </Card>
  );
}

/** A row of KpiTileSkeletons in the same grid every real KpiRow uses. */
export function KpiRowSkeleton({ count, cols, compact, tint }: { count: number; cols: string; compact?: boolean; tint?: boolean }) {
  return (
    <div className={`grid ${cols} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <KpiTileSkeleton key={i} compact={compact} tint={tint} />
      ))}
    </div>
  );
}

/** Mirrors SectionTitle exactly — icon badge + title bar, optional trailing text. */
export function SectionTitleSkeleton({ titleWidth = "w-32", trailing = false }: { titleWidth?: string; trailing?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
        <Skeleton className={`h-4 ${titleWidth} rounded`} />
      </div>
      {trailing && <Skeleton className="h-3 w-20 rounded" />}
    </div>
  );
}

const BAR_WIDTHS = ["w-4/5", "w-3/5", "w-full", "w-2/5", "w-3/4", "w-1/2"];

/** A horizontal bar chart's rows — ScoreDistribution/MarketPulse/
 * ContentFunnel/AcquisitionFunnel/LeadStatusBreakdown all share this shape:
 * a category label then a bar of varying length. */
export function BarRowsSkeleton({ rows = 4, height = 190, labelWidth = "w-16" }: { rows?: number; height?: number; labelWidth?: string }) {
  return (
    <div style={{ height }} className="flex flex-col justify-around">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className={`h-3 ${labelWidth} rounded shrink-0`} />
          <Skeleton className={`h-5 ${BAR_WIDTHS[i % BAR_WIDTHS.length]} rounded-md`} />
        </div>
      ))}
    </div>
  );
}

/** A line/area trend chart's plot area, optionally with a legend row below
 * for the two-series charts (ReachTrend/LeadsBySource/CampaignBreakdown). */
export function AreaChartSkeleton({ height = 200, legendItems = 0 }: { height?: number; legendItems?: number }) {
  return (
    <div>
      <Skeleton className="w-full rounded-lg" style={{ height }} />
      {legendItems > 0 && (
        <div className="flex items-center justify-center gap-4 mt-3">
          {Array.from({ length: legendItems }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Skeleton className="w-2 h-2 rounded-full" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** FormatBreakdown/EngagementBreakdown's pie + side legend layout. */
export function PieChartSkeleton({ legendRows = 4 }: { legendRows?: number }) {
  return (
    <div className="flex items-center gap-6">
      <Skeleton className="w-32 h-32 rounded-full shrink-0" />
      <div className="space-y-2.5 flex-1 min-w-0">
        {Array.from({ length: legendRows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Skeleton className="w-2 h-2 rounded-full shrink-0" />
              <Skeleton className="h-3 w-16 rounded" />
            </div>
            <Skeleton className="h-3 w-8 rounded shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** PlatformComparison/ImpressionsByPlatform's icon + proportional-bar rows. */
export function ProportionalListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
            <Skeleton className={`h-2 ${BAR_WIDTHS[i % BAR_WIDTHS.length]} rounded-full`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** TopPosts/recent-activity style rows — icon, two text lines, trailing stat. */
export function RowListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3 border-b border-default last:border-b-0">
          <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3.5 w-32 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
          <Skeleton className="h-3 w-12 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** GapOpportunities' rows — a dot, a two-line text block, a priority pill. */
export function GapListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-default/60">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <Skeleton className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
          <Skeleton className="h-4 w-14 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** PlatformHealth's icon + label + status-pill grid. */
export function IconGridSkeleton({ items = 6, cols = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" }: { items?: number; cols?: string }) {
  return (
    <div className={`grid ${cols} gap-3`}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <Skeleton className="w-9 h-9 rounded-lg" />
          <Skeleton className="h-3 w-14 rounded" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** A plain comparison table — header row + data rows, each cell a stacked
 * value+label pair (ChannelTable's shape). */
export function TableSkeleton({ rows = 3, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="border border-default rounded-lg overflow-hidden">
      <div className="h-10 bg-surface flex items-center px-4 gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-16 rounded" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="h-14 flex items-center px-4 gap-6 border-t border-default">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-3 ${c === 0 ? "w-24" : "w-12"} rounded`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** ModuleTrendCard's shape — icon + title row, one headline number, two
 * label lines, a small sparkline area. */
export function ModuleCardSkeleton() {
  return (
    <Card>
      <div className="flex items-center gap-2.5 mb-4">
        <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
        <Skeleton className="h-4 w-24 rounded" />
      </div>
      <Skeleton className="h-7 w-20 rounded mb-2" />
      <Skeleton className="h-3 w-28 rounded mb-1" />
      <Skeleton className="h-2.5 w-20 rounded mb-3" />
      <Skeleton className="w-full rounded" style={{ height: 48 }} />
    </Card>
  );
}
