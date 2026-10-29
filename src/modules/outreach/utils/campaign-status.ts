export type CampaignStatusValue = "draft" | "ready" | "sending" | "sent" | "paused" | "no_recipients";
export type CampaignStatusTone = "success" | "warning" | "danger" | "muted";

export interface CampaignStatusInfo {
  value: CampaignStatusValue;
  label: string;
  tone: CampaignStatusTone;
  /** Secondary detail — only ever set for "paused", where the single-word
   * label can't distinguish "you paused it" from "Instantly flagged a
   * problem." Never part of the label itself. */
  reason?: string;
}

const STATUS_META: Record<CampaignStatusValue, { label: string; tone: CampaignStatusTone }> = {
  draft: { label: "Draft", tone: "muted" },
  ready: { label: "Ready to Send", tone: "muted" },
  sending: { label: "Sending", tone: "success" },
  sent: { label: "Sent", tone: "success" },
  paused: { label: "Paused", tone: "danger" },
  no_recipients: { label: "No Recipients", tone: "warning" },
};

function build(value: CampaignStatusValue, reason?: string): CampaignStatusInfo {
  return { value, ...STATUS_META[value], reason };
}

export interface ResolveCampaignStatusInput {
  /** outreach_campaigns.status — our own workflow field, never shown to the user directly. */
  localStatus: string;
  externalCampaignId: string | null;
  /** Instantly's live numeric campaign status, if we have Instantly data for it yet. */
  instantlyStatus?: number;
  sent: number;
  /** How many leads we ourselves queued for this campaign (outreach_campaign_leads count). */
  recipientsTargeted?: number;
}

/** Instantly's campaign status codes, confirmed by directly testing against
 * the real account: 0 = Draft, 1 = Active/Sending, 3 = Completed (the
 * sequence finished for every lead in it — confirmed live: a campaign with
 * 4 leads showed status 3 with completed_count: 4, emails_sent_count: 4,
 * leads_count: 4, all matching exactly), -1 = Accounts Unhealthy (no
 * healthy sending account), -2 = Bounce Protect (auto-paused for a high
 * bounce rate). Codes 2, 4, -99 are documented but never observed directly
 * — they fall back to a generic "paused, unrecognized code" rather than a
 * guessed specific label. */

/** Single merge point for the two data sources this app has for a
 * campaign's state — our own workflow status and Instantly's live delivery
 * status — into exactly one of six values. Nothing downstream of this
 * function should ever branch on outreach_campaigns.status or Instantly's
 * raw numeric status directly; it always goes through here first. */
export function resolveCampaignStatus(input: ResolveCampaignStatusInput): CampaignStatusInfo {
  const { localStatus, externalCampaignId, instantlyStatus, sent, recipientsTargeted } = input;

  if (localStatus === "draft") return build("draft");
  if (localStatus === "completed") return build("no_recipients");
  if (!externalCampaignId) return build("ready");
  if (localStatus === "paused") return build("paused", "Paused by you");

  // Reached Instantly, not paused by us — Instantly's own live status decides the rest.
  if (instantlyStatus === undefined) return build("sending"); // no Instantly data yet — assume in progress
  if (instantlyStatus === 1) {
    return recipientsTargeted && sent >= recipientsTargeted ? build("sent") : build("sending");
  }
  if (instantlyStatus === 3) return build("sent"); // sequence completed for everyone in it
  if (instantlyStatus === -1) return build("paused", "Instantly flagged a sending-account issue");
  if (instantlyStatus === -2) return build("paused", "Instantly's bounce protection paused this campaign");
  return build("paused", `Instantly reports an unrecognized status (code ${instantlyStatus}) — check Instantly's dashboard`);
}
