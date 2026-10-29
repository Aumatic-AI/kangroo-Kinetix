"use client";
import { useState } from "react";
import { Eye, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useMetaCampaignBreakdown } from "@/modules/outreach/hooks/useLeads";
import { MetaCampaignLeadBreakdown } from "@/modules/outreach/types/leads.types";
import { LeadsDrawer } from "../components/leads/LeadsDrawer";

/** Mirrors the table's real columns exactly — only the body shimmers, the
 * header renders immediately since its labels are already known. */
function LeadListsTableSkeleton() {
  return (
    <div className="border border-default rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Meta Ads Campaign</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                  <Skeleton className="h-3.5 w-32 rounded" />
                </div>
              </TableCell>
              <TableCell className="text-right"><Skeleton className="h-3.5 w-8 rounded ml-auto" /></TableCell>
              <TableCell>
                <div className="flex items-center gap-2 justify-end">
                  <Skeleton className="h-8 w-16 rounded-lg" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Leads here are entirely Meta Ads-derived now — no manual list creation,
 * no scraping. Each Meta Ads campaign that has at least one captured lead
 * shows up as its own row, live, with its real lead count (see
 * useMetaCampaignBreakdown) — never stale, since it's computed fresh from
 * Meta Ads' own `leads` table on every load. "View" opens the individual
 * leads (name/email), also read live, not from a separately-imported copy.
 */
export function LeadsPage() {
  const [selected, setSelected] = useState<MetaCampaignLeadBreakdown | null>(null);
  const { data: campaigns, isLoading } = useMetaCampaignBreakdown();

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <div>
        <h2 className="text-2xl font-bold text-text">Leads</h2>
        <p className="text-sm text-muted mt-1">Every Meta Ads campaign that has captured leads, and how many.</p>
      </div>

      {isLoading ? (
        <LeadListsTableSkeleton />
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="py-16 text-center border border-default rounded-2xl border-dashed space-y-2">
          <p className="text-sm text-muted">No leads yet — they&apos;ll appear here once a Meta Ads Instant Form captures one.</p>
        </div>
      ) : (
        <div className="border border-default rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Meta Ads Campaign</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => (
                <TableRow key={c.campaignName}>
                  <TableCell className="font-semibold text-text">
                    <div className="flex items-center gap-3">
                      <Avatar icon={Megaphone} />
                      <span>{c.campaignName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted">{c.totalLeads}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <Button size="sm" variant="outline" onClick={() => setSelected(c)} icon={<Eye className="w-3.5 h-3.5" />}>View</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LeadsDrawer campaign={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
