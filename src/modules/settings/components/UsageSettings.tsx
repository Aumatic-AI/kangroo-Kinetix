"use client";
import { useState } from "react";
import { ImageIcon, Video, Send, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useUsage } from "../hooks/useUsage";
import { CostRange, CostConfidence, USD_TO_INR, typicalUnitCosts } from "@/lib/costEstimates";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function fmtUSD(inr: number): string {
  const usd = inr / USD_TO_INR;
  if (usd > 0 && usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtRange(r: CostRange): string {
  return r.minINR === r.maxINR ? fmtUSD(r.minINR) : `${fmtUSD(r.minINR)}–${fmtUSD(r.maxINR)}`;
}

/** Real average (total / count) when this feature actually ran this month;
 * otherwise the baseline per-unit rate, so the column is never blank. */
function perUnitCost(total: CostRange, count: number, fallback: CostRange): CostRange {
  if (count === 0) return fallback;
  return { minINR: total.minINR / count, maxINR: total.maxINR / count, confidence: total.confidence };
}

function addRanges(a: CostRange, b: CostRange): CostRange {
  return { minINR: a.minINR + b.minINR, maxINR: a.maxINR + b.maxINR, confidence: a.confidence === "reliable" && b.confidence === "reliable" ? "reliable" : "rough" };
}

function averageRanges(a: CostRange, b: CostRange): CostRange {
  return { minINR: (a.minINR + b.minINR) / 2, maxINR: (a.maxINR + b.maxINR) / 2, confidence: a.confidence === "reliable" && b.confidence === "reliable" ? "reliable" : "rough" };
}

function AccuracyBadge({ confidence }: { confidence: CostConfidence }) {
  const isAccurate = confidence === "reliable";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${isAccurate ? "bg-success-bg text-success" : "bg-warning-bg text-warning"}`}
    >
      {isAccurate ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {isAccurate ? "Accurate" : "May cost more"}
    </span>
  );
}

function UsageRow({
  icon: Icon,
  name,
  countLabel,
  perUnit,
  total,
}: {
  icon: typeof ImageIcon;
  name: string;
  countLabel: string;
  perUnit: CostRange;
  total: CostRange;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface border border-default flex items-center justify-center shrink-0 text-muted">
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-text whitespace-normal">{name}</span>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted whitespace-normal">{countLabel}</TableCell>
      <TableCell className="text-sm text-text">{fmtRange(perUnit)}</TableCell>
      <TableCell className="text-sm font-bold text-text">{fmtRange(total)}</TableCell>
      <TableCell><AccuracyBadge confidence={total.confidence} /></TableCell>
    </TableRow>
  );
}

export function UsageSettings() {
  const [month, setMonth] = useState(currentMonth);
  const { data, isLoading } = useUsage(month);
  const isCurrentMonth = month === currentMonth();

  return (
    <Section
      title="Usage & Estimated Cost"
      description="Real generation counts for the selected month, priced with modeled provider rates — an estimate, not exact billing."
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="w-8 h-8 rounded-lg border border-default bg-background flex items-center justify-center text-muted hover:text-text hover:bg-surface transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-text w-32 text-center">{monthLabel(month)}</span>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={isCurrentMonth}
            className="w-8 h-8 rounded-lg border border-default bg-background flex items-center justify-center text-muted hover:text-text hover:bg-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-background"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      }
    >
      {isLoading || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-background border border-default">
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">{data.periodLabel}</p>
              <p className="text-2xl font-bold text-text mt-0.5">{fmtRange(data.estimate.total)}</p>
            </div>
            <p className="text-xs text-muted max-w-[200px] text-right">Estimated total across everything generated this month</p>
          </div>

          <div className="border border-default rounded-lg overflow-hidden bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Used this month</TableHead>
                  <TableHead>Cost per unit</TableHead>
                  <TableHead>Total this month</TableHead>
                  <TableHead>Accuracy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <UsageRow
                  icon={ImageIcon}
                  name="Image ads"
                  countLabel={`${data.counts.imageAdCount + data.counts.studioImageCount} generated`}
                  perUnit={perUnitCost(
                    addRanges(data.estimate.imageAd, data.estimate.studio),
                    data.counts.imageAdCount + data.counts.studioImageCount,
                    averageRanges(typicalUnitCosts().imageAd, typicalUnitCosts().studioImage)
                  )}
                  total={addRanges(data.estimate.imageAd, data.estimate.studio)}
                />
                <UsageRow
                  icon={Video}
                  name="Video ads"
                  countLabel={`${data.counts.videoAdCount} generated`}
                  perUnit={perUnitCost(data.estimate.video, data.counts.videoAdCount, typicalUnitCosts().video)}
                  total={data.estimate.video}
                />
                <UsageRow
                  icon={Send}
                  name="Outreach leads"
                  countLabel={`${data.counts.outreachLeadCount} scraped + verified`}
                  perUnit={perUnitCost(data.estimate.outreach, data.counts.outreachLeadCount, typicalUnitCosts().outreachLead)}
                  total={data.estimate.outreach}
                />
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Section>
  );
}
