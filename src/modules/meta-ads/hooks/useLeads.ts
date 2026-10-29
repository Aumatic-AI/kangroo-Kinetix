import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { PaginationMeta } from "@/lib/pagination";

export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "not_interested";
export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "converted", "not_interested"];
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  not_interested: "Not Interested",
};

export interface Lead {
  id: string;
  created_at: string;
  meta_lead_id: string;
  meta_form_id: string | null;
  ad_id: string | null;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  field_data: Record<string, string>;
  status: LeadStatus;
}

export interface LeadFormQuestion {
  type: string;
  label?: string;
}

export interface LeadFormThankYouPage {
  title?: string;
  body?: string;
  button_type?: string;
  website_url?: string;
  button_text?: string;
}

export interface LeadFormContextCard {
  title?: string;
  content?: string[];
  button_text?: string;
}

/** Everything Meta actually has on record for one Instant Form — fetched
 * live, every field Kinetix's create flow can set (see CreateLeadFormInput
 * below), so the View/List UI never shows less than what was configured. */
export interface LeadForm {
  id: string;
  name: string;
  status: string;
  locale?: string;
  leads_count?: number;
  created_time?: string;
  questions?: LeadFormQuestion[];
  privacy_policy_url?: string;
  is_optimized_for_quality?: boolean;
  context_card?: LeadFormContextCard;
  thank_you_page?: LeadFormThankYouPage;
}

/** Every field the "New Instant Form" modal collects, mapped 1:1 to what
 * POST /api/meta-ads/lead-forms sends Meta. Deliberately leaves out
 * question_page_custom_disclaimer — Meta's format for it is the least
 * documented/most failure-prone part of this API, and the privacy_policy
 * link already covers the compliance need for the vast majority of forms. */
export interface CreateLeadFormInput {
  name: string;
  standardQuestions: string[];
  customQuestions: string[];
  privacyPolicyUrl: string;
  privacyPolicyLinkText: string;
  locale: string;
  contextCardEnabled: boolean;
  contextCardTitle?: string;
  contextCardContent?: string;
  contextCardButtonText?: string;
  thankYouButtonType: "VIEW_WEBSITE" | "NONE";
  thankYouTitle?: string;
  thankYouBody?: string;
  thankYouWebsiteUrl?: string;
  thankYouButtonText?: string;
  isOptimizedForQuality: boolean;
}

export const leadsKeys = {
  all: ["leads"] as const,
  listAll: () => [...leadsKeys.all, "list"] as const,
  list: (page: number, limit: number) => [...leadsKeys.listAll(), page, limit] as const,
  forms: () => [...leadsKeys.all, "forms"] as const,
  form: (id: string) => [...leadsKeys.forms(), id] as const,
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/** Syncs live from Meta on every fetch (see the API route's own comment) —
 * not DB-only, a real multi-second round trip on each load/page change, by
 * deliberate choice: no background cron, no risk of stale data. */
export function useLeadsList(page: number, limit: number) {
  return useQuery({
    queryKey: leadsKeys.list(page, limit),
    queryFn: () => fetchJson<{ leads: Lead[] } & PaginationMeta>(`/api/meta-ads/leads?page=${page}&limit=${limit}`),
    placeholderData: keepPreviousData,
  });
}

/** The "Sync now" button — forces another live sync without navigating
 * away or reloading the page (GET already syncs live on its own). */
export function useSyncLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson<{ success: true; formsChecked: number; leadsImported: number }>("/api/meta-ads/leads/sync", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadsKeys.listAll() }),
  });
}

/** Changes a lead's status — updates our own DB and best-effort reports it
 * to Meta's Conversions API for CRM (see the API route's own comment). */
export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      fetchJson<{ success: true }>("/api/meta-ads/leads/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadsKeys.listAll() }),
  });
}

/** Instant Forms live entirely on Meta (see the API route's own comment) —
 * includes archived forms too, so a form can still be viewed after it's
 * archived instead of disappearing from the list entirely. */
export function useLeadForms() {
  return useQuery({
    queryKey: leadsKeys.forms(),
    queryFn: () => fetchJson<{ forms: LeadForm[] }>("/api/meta-ads/lead-forms").then((d) => d.forms),
    retry: false,
  });
}

/** The Ad Detail page's "Instant Form" link — fetches just the one form an
 * ad is linked to, by ID, instead of the whole account's form list. */
export function useLeadForm(formId: string | null) {
  return useQuery({
    queryKey: leadsKeys.form(formId || ""),
    queryFn: () => fetchJson<{ form: LeadForm }>(`/api/meta-ads/lead-forms?formId=${formId}`).then((d) => d.form),
    enabled: !!formId,
  });
}

export function useCreateLeadForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadFormInput) =>
      fetchJson("/api/meta-ads/lead-forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadsKeys.forms() }),
  });
}

export function useArchiveLeadForm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formId: string) => fetchJson(`/api/meta-ads/lead-forms?formId=${formId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: leadsKeys.forms() }),
  });
}
