import Link from "next/link";
import { LucideIcon, ArrowRight } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Card } from "@/components/global/DashboardKit";

interface ModuleTrendCardProps {
  icon: LucideIcon;
  title: string;
  href: string;
  accent: { solid: string; tint: string };
  headline: string;
  headlineLabel: string;
  secondary: string;
  data: { date: string; value: number }[];
}

/** One module's headline stat + a secondary stat + a real sparkline of its
 * own key daily metric — small multiples, not one shared-axis chart, since
 * spend/sends/followers don't share a unit. Clicking through goes to that
 * module's own (much deeper) dashboard. */
export function ModuleTrendCard({ icon: Icon, title, href, accent, headline, headlineLabel, secondary, data }: ModuleTrendCardProps) {
  const gradientId = `trend-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <Link href={href} className="block group">
      <Card className="h-full transition-colors group-hover:border-primary-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: accent.tint, color: accent.solid }}>
              <Icon className="w-4 h-4" />
            </div>
            <h3 className="text-[15px] font-bold text-text">{title}</h3>
          </div>
          <ArrowRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        <p className="text-2xl font-bold text-text tabular-nums leading-none">{headline}</p>
        <p className="text-xs font-medium text-muted mt-1.5">{headlineLabel}</p>
        <p className="text-[11px] text-muted/70 mt-0.5 mb-3">{secondary}</p>

        <div style={{ height: 48 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent.solid} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={accent.solid} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke={accent.solid} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </Link>
  );
}
