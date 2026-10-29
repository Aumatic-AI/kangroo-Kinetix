"use client";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { formatDateTime } from "@/utils/datetime";
import { EmptyState } from "../dashboard/shared";
import { LeadStatusControl } from "./LeadStatusControl";
import { Lead, useLeadForms } from "../../hooks/useLeads";

const NAME_KEYS = ["full_name", "first_name"];
const EMAIL_KEYS = ["email"];

function pick(fieldData: Record<string, string>, keys: string[]): string {
  for (const key of keys) if (fieldData[key]) return fieldData[key];
  return "—";
}

export function LeadsTable({ leads, onView }: { leads: Lead[]; onView: (lead: Lead) => void }) {
  const { data: forms } = useLeadForms();
  const formNameById = new Map((forms || []).map((f) => [f.id, f.name]));

  if (leads.length === 0) return <EmptyState message="No leads yet — they'll appear here the moment someone submits a form." />;

  return (
    <div className="border border-default rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Form</TableHead>
            <TableHead>Received</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const name = pick(lead.field_data, NAME_KEYS);
            const formName = (lead.meta_form_id && formNameById.get(lead.meta_form_id)) || "—";
            return (
              <TableRow key={lead.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar label={name} />
                    <span className="font-semibold text-text">{name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted">{pick(lead.field_data, EMAIL_KEYS)}</TableCell>
                <TableCell className="text-muted truncate max-w-40">{formName}</TableCell>
                <TableCell className="text-muted whitespace-nowrap">{formatDateTime(lead.created_at)}</TableCell>
                <TableCell>
                  <LeadStatusControl leadId={lead.id} status={lead.status} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button size="sm" variant="primary" onClick={() => onView(lead)}>View</Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
