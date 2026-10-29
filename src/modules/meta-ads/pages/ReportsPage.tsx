"use client";
import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { PAGE_SIZE_COMPACT } from "@/lib/pagination";
import { EmptyState, Card } from "../components/dashboard/shared";
import { ReportKpiRow } from "../components/reports/ReportKpiRow";
import { useReportsData, ReportRange } from "../hooks/useReports";

// Table rows — compact page size.
const PAGE_SIZE = PAGE_SIZE_COMPACT;

/** Mirrors ReportKpiRow's exact Card shape (icon badge + label/value stack). */
function ReportKpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="p-4 flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-2.5 w-14 rounded" />
            <Skeleton className="h-4 w-12 rounded" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Mirrors the ad table's real columns — only the body shimmers. */
function ReportsTableSkeleton() {
  return (
    <div className="border border-default rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ad</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Spend</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">CPM</TableHead>
            <TableHead className="text-right">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4, 5].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <Skeleton className="w-8 h-8 rounded-md shrink-0" />
                  <Skeleton className="h-3.5 w-32 rounded" />
                </div>
              </TableCell>
              <TableCell><Skeleton className="h-3.5 w-24 rounded" /></TableCell>
              <TableCell><Skeleton className="h-3 w-16 rounded" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-3.5 w-12 rounded ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-3.5 w-10 rounded ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-3.5 w-10 rounded ml-auto" /></TableCell>
              <TableCell className="text-right"><Skeleton className="h-5 w-9 rounded-full ml-auto" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const RANGES: { value: ReportRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "14d", label: "14 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

const SCORE_STYLE = (score: number) =>
  score >= 80 ? "text-success bg-success-bg" : score >= 60 ? "text-primary bg-primary-subtle" : score >= 40 ? "text-warning bg-warning-bg" : "text-danger bg-danger-bg";

export function ReportsPage() {
  const [range, setRange] = useState<ReportRange>("7d");
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useReportsData(range, page, PAGE_SIZE);

  const ads = data?.ads || [];

  const changeRange = (next: ReportRange) => {
    setRange(next);
    setPage(1);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-text">Reports</h2>
          <p className="text-sm text-muted mt-1">Live from Meta for the selected range — never a cached snapshot.</p>
        </div>
        <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => changeRange(r.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${range === r.value ? "bg-background text-text shadow-sm" : "text-muted hover:text-text"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-sm text-danger bg-danger-bg border border-danger-border rounded-xl px-4 py-3">{(error as Error).message}</div>}

      {isLoading ? (
        <div className="space-y-6">
          <ReportKpiRowSkeleton />
          <ReportsTableSkeleton />
        </div>
      ) : ads.length === 0 ? (
        <EmptyState message="No ads with delivery in this range yet." />
      ) : (
        <>
          {data && <ReportKpiRow summary={data.summary} />}

          <p className="text-xs text-muted">{data?.summary.scoreMethodology}</p>

          <div className="border border-default rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPM</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ads.map((ad) => (
                  <TableRow key={ad.adId}>
                    <TableCell>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-md bg-surface overflow-hidden shrink-0 flex items-center justify-center">
                          {ad.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ad.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5 text-muted" />
                          )}
                        </div>
                        <span className="font-semibold text-text truncate max-w-[180px]">{ad.adName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted">{ad.campaignName}</TableCell>
                    <TableCell><span className="text-[10px] font-bold uppercase text-muted">{ad.status.replace(/_/g, " ")}</span></TableCell>
                    <TableCell className="text-right tabular-nums">${ad.spend.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{ad.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="text-right tabular-nums">${ad.cpm.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${SCORE_STYLE(ad.score)}`}>{ad.score}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination page={page} totalPages={data?.totalPages || 1} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
