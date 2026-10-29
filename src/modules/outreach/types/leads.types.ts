/**
 * Outreach's own lead data. "List" is the one term used everywhere for what
 * the DB calls `outreach_lead_lists` — no "category" anywhere in this
 * module's naming, DB, or UI.
 */

export type LeadSource = "scraped" | "manual" | "import";
export type EmailVerificationStatus = "unverified" | "verified" | "invalid" | "catch_all" | "risky";
export type LeadStatus = "new" | "contacted" | "replied" | "interested" | "not_interested" | "bounced" | "do_not_contact";

export interface LeadList {
  id: string;
  business_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/** What the Leads page's lists table actually fetches — getLists() only
 * selects these columns (see outreach.service.ts); business_id/created_at/
 * updated_at aren't shown anywhere in the UI. */
export interface LeadListSummary {
  id: string;
  name: string;
}

export interface Lead {
  id: string;
  business_id: string;
  list_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  company: string | null;
  city: string | null;
  country: string | null;
  source: LeadSource;
  email_verification_status: EmailVerificationStatus;
  status: LeadStatus;
  created_at: string;
  updated_at: string;
}

/** What the leads drawer (opened from "View" on a list) actually fetches —
 * getLeads() only selects these columns. Only name/email/location are shown
 * in LeadsTable, so the rest of the row isn't fetched for now. */
export interface LeadSummary {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  city: string | null;
  country: string | null;
}

export interface LeadFilters {
  listId?: string;
  /** Matches any of these lists — for a combined count across several
   * selected lists at once (e.g. New Campaign's multi-select). Additive
   * with listId, not a replacement for it. */
  listIds?: string[];
  search?: string;
  status?: LeadStatus;
  excludeStatuses?: LeadStatus[];
}

/** One Meta Ads campaign's leads, live-computed from Meta Ads' own `leads`
 * table (not stored) — shown as a selectable "list" in campaign creation
 * alongside real outreach_lead_lists. `totalLeads` is every lead Meta
 * captured for that campaign; `emailableLeads` is how many actually have a
 * usable email address (Instant Form email questions are optional, so this
 * can be lower than totalLeads) — only those get imported/sent. Picking one
 * imports it into a real list named `Meta: <campaignName>` at that point. */
export interface MetaCampaignLeadBreakdown {
  campaignName: string;
  totalLeads: number;
  emailableLeads: number;
}

/** One raw Meta Ads lead, as shown in the Leads page's "View" drawer —
 * read live from Meta's own `leads` table (field_data extracted), not from
 * outreach_leads. `email` can genuinely be null here (an Instant Form's
 * email question is optional) — LeadsTable renders a "—" placeholder for it. */
export interface MetaCampaignLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

/** One row per campaign this lead was ever queued for — from our own
 * outreach_campaign_leads table, not a live Instantly call. Deliberately
 * doesn't include open/reply/click: that's only available from Instantly
 * per-campaign in aggregate, not reliably per-lead without an extra live
 * lookup per entry. */
export interface LeadCampaignHistoryEntry {
  campaignId: string;
  campaignName: string;
  status: "queued" | "sent" | "failed";
  sentAt: string | null;
}
