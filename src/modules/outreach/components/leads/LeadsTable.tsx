"use client";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Avatar } from "@/components/ui/Avatar";
import { MetaCampaignLead } from "../../types/leads.types";
// No add/delete/edit here — these are Meta Ads leads, read live, not
// something managed from this table.

export function LeadsTable({ leads }: { leads: MetaCampaignLead[] }) {
  if (leads.length === 0) {
    return <div className="py-16 text-center text-muted border border-default rounded-2xl border-dashed text-sm">No leads yet.</div>;
  }

  return (
    <div className="border border-default rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((l) => {
            const name = [l.first_name, l.last_name].filter(Boolean).join(" ");
            return (
              <TableRow key={l.id}>
                <TableCell className="font-semibold text-text">
                  <div className="flex items-center gap-3">
                    <Avatar label={name || l.email || "?"} />
                    <span>{name || "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted">{l.email || "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
