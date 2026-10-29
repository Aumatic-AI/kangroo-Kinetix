"use client";
import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { StatusChip } from "../campaigns/shared";
import { EmptyState } from "../dashboard/shared";
import { localeLabel } from "./shared";
import { formatDate } from "@/utils/datetime";
import { useLeadForms, useArchiveLeadForm, LeadForm } from "../../hooks/useLeads";
import { LeadFormDetailsModal } from "./LeadFormDetailsModal";

/**
 * Instant Forms as a table, matching the Leads tab's own table — includes
 * archived forms (not hidden) since Meta has no un-archive for them, so
 * "View" is the only way to see one again afterward.
 */
export function LeadFormsPanel() {
  const { data: forms, isLoading, error } = useLeadForms();
  const archiveForm = useArchiveLeadForm();
  const [viewingForm, setViewingForm] = useState<LeadForm | null>(null);
  const [archivingForm, setArchivingForm] = useState<LeadForm | null>(null);
  const [archiveError, setArchiveError] = useState("");

  if (error) {
    return (
      <div className="text-sm text-muted bg-surface border border-default rounded-xl px-4 py-3">
        Lead forms need Page setup first — set <code>META_PAGE_ID</code> and <code>META_PAGE_TOKEN</code>. See the build guide&apos;s Leads section for the exact steps.
      </div>
    );
  }

  const confirmArchive = async () => {
    if (!archivingForm) return;
    setArchiveError("");
    try {
      await archiveForm.mutateAsync(archivingForm.id);
      setArchivingForm(null);
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : "Failed to archive form");
    }
  };

  return (
    <>
      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-12 rounded-lg bg-surface animate-pulse" />)}</div>
      ) : !forms?.length ? (
        <EmptyState message="No Instant Forms yet." />
      ) : (
        <div className="border border-default rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar icon={ClipboardList} />
                      <span className="font-semibold text-text truncate max-w-60">{f.name}</span>
                    </div>
                  </TableCell>
                  <TableCell><StatusChip status={f.status} /></TableCell>
                  <TableCell className="text-muted">{f.leads_count ?? "—"}</TableCell>
                  <TableCell className="text-muted">{localeLabel(f.locale)}</TableCell>
                  <TableCell className="text-muted whitespace-nowrap">{f.created_time ? formatDate(f.created_time) : "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setViewingForm(f)}>View</Button>
                      {f.status !== "ARCHIVED" && (
                        <Button size="sm" variant="outline" className="text-danger border-danger/30 hover:bg-danger-bg" onClick={() => setArchivingForm(f)}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LeadFormDetailsModal form={viewingForm} onClose={() => setViewingForm(null)} />

      <ConfirmModal
        open={!!archivingForm}
        onOpenChange={(open) => { if (!open && !archiveForm.isPending) { setArchivingForm(null); setArchiveError(""); } }}
        title="Archive this form?"
        description={`"${archivingForm?.name}" will stop accepting new submissions. This is permanent — Meta doesn't allow un-archiving a form from here.`}
        confirmLabel="Archive"
        variant="destructive"
        loading={archiveForm.isPending}
        error={archiveError}
        onConfirm={confirmArchive}
      />
    </>
  );
}
