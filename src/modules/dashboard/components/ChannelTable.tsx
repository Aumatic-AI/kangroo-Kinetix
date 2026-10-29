import { LayoutGrid, Megaphone, Send, Share2 } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ACCENT, SectionTitle, Card } from "@/components/global/DashboardKit";
import { RootDashboardData } from "../hooks/useDashboard";

const CHANNEL_ICON: Record<string, { icon: typeof Megaphone; accent: { solid: string; tint: string } }> = {
  "Meta Ads": { icon: Megaphone, accent: ACCENT.purple },
  Outreach: { icon: Send, accent: ACCENT.blue },
  Social: { icon: Share2, accent: ACCENT.green },
};

/** A plain side-by-side comparison — deliberately a table, not a chart.
 * Each channel's most natural metrics use a different basis (some are
 * scoped to the selected range, some are live/all-time), so a shared-axis
 * chart would misrepresent them as comparable; a table just states each
 * number for what it is. */
export function ChannelTable({ rows }: { rows: RootDashboardData["channelTable"] }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-5 pb-0">
        <SectionTitle icon={LayoutGrid} accent={ACCENT.purple} title="Channel Comparison" />
      </div>
      <div className="px-5 pb-5">
        <div className="border border-default rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Volume</TableHead>
                <TableHead className="text-right">Result</TableHead>
                <TableHead className="text-right">Signal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const meta = CHANNEL_ICON[row.channel];
                const Icon = meta?.icon;
                return (
                  <TableRow key={row.channel}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: meta?.accent.tint, color: meta?.accent.solid }}>
                          {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
                        </div>
                        <span className="font-semibold text-text">{row.channel}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="tabular-nums font-semibold text-text">{row.primaryValue}</p>
                      <p className="text-[11px] text-muted">{row.primaryLabel}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="tabular-nums font-semibold text-text">{row.resultValue}</p>
                      <p className="text-[11px] text-muted">{row.resultLabel}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <p className="tabular-nums font-semibold text-text">{row.rateValue}</p>
                      <p className="text-[11px] text-muted">{row.rateLabel}</p>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </Card>
  );
}
