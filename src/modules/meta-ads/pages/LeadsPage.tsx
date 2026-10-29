"use client";
import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { PAGE_SIZE_COMPACT } from "@/lib/pagination";
import { TabSwitch } from "@/components/global/TabSwitch";
import { useLeadsList, useSyncLeads, useLeadForms, Lead } from "../hooks/useLeads";
import { LeadsTable } from "../components/leads/LeadsTable";
import { LeadDetailsModal } from "../components/leads/LeadDetailsModal";
import { LeadFormsPanel } from "../components/leads/LeadFormsPanel";
import { CreateLeadFormModal } from "../components/leads/CreateLeadFormModal";

// Table rows — compact page size.
const PAGE_SIZE = PAGE_SIZE_COMPACT;

/** Mirrors LeadsTable's real columns exactly — only the body shimmers, the
 * header renders immediately since its labels are already known. */
function LeadsTableSkeleton() {
  return (
    <div className="border border-default rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Form</TableHead>
            <TableHead>Received</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {[1, 2, 3, 4].map((i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                  <Skeleton className="h-3.5 w-24 rounded" />
                </div>
              </TableCell>
              <TableCell><Skeleton className="h-3.5 w-36 rounded" /></TableCell>
              <TableCell><Skeleton className="h-3.5 w-28 rounded" /></TableCell>
              <TableCell><Skeleton className="h-3.5 w-24 rounded" /></TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <Skeleton className="h-8 w-14 rounded-lg" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function LeadsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useLeadsList(page, PAGE_SIZE);
  const leads = data?.leads || [];
  const { data: forms = [] } = useLeadForms();
  const syncMutation = useSyncLeads();
  const [viewingLead, setViewingLead] = useState<Lead | null>(null);
  const [tab, setTab] = useState("leads");
  const [creatingForm, setCreatingForm] = useState(false);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-text">Lead Responses</h2>
          <p className="text-sm text-muted mt-1">Synced from Meta every few minutes — use &quot;Sync now&quot; for an immediate check.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => syncMutation.mutate()}
          loading={syncMutation.isPending}
          icon={<RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />}
        >
          {syncMutation.isPending ? "Syncing…" : "Sync now"}
        </Button>
      </div>

      {syncMutation.data && (
        <p className="text-xs text-muted">Checked {syncMutation.data.formsChecked} form(s), imported {syncMutation.data.leadsImported} lead(s).</p>
      )}
      {syncMutation.error && <p className="text-sm text-danger">{(syncMutation.error as Error).message}</p>}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <TabSwitch
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "leads", label: "Leads", count: data?.total ?? leads.length },
            { value: "forms", label: "Instant Forms", count: forms.length },
          ]}
        />
        {tab === "forms" && (
          <Button size="sm" onClick={() => setCreatingForm(true)} icon={<Plus className="w-3.5 h-3.5" />}>
            New Instant Form
          </Button>
        )}
      </div>
      <div>
        {tab === "leads" ? (
          isLoading ? (
            <LeadsTableSkeleton />
          ) : (
            <>
              <LeadsTable leads={leads} onView={setViewingLead} />
              <Pagination page={page} totalPages={data?.totalPages || 1} onPageChange={setPage} className="mt-4" />
            </>
          )
        ) : (
          <LeadFormsPanel />
        )}
      </div>

      <LeadDetailsModal lead={viewingLead} onClose={() => setViewingLead(null)} />
      <CreateLeadFormModal open={creatingForm} onClose={() => setCreatingForm(false)} />
    </div>
  );
}
