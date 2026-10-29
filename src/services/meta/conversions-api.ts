import { graphPost, requireMetaConversionsEnv } from "./graph-client";

/** Kinetix's own lead status -> the event name reported to Meta. Meta
 * doesn't define fixed status values for this — you send whatever event
 * name represents your funnel stage, and a campaign whose ad set is later
 * switched to the "Conversion Leads" optimization goal learns from
 * whichever event name it's told to target. "new" has nothing to report
 * yet, so it's intentionally left out. */
const STATUS_EVENT_NAME: Record<string, string> = {
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  not_interested: "NotInterested",
};

/**
 * Reports a lead status change to Meta's Conversions API for CRM, matched
 * back to the original Instant Form submission by Meta's own lead ID
 * (`meta_lead_id`). This is what lets a campaign later switched to the
 * "Conversion Leads" optimization goal learn what a qualified/converted
 * lead looks like — sending the event alone does nothing to ad delivery
 * until that optimization goal is turned on for a campaign (not part of
 * this change). No-ops for "new" (nothing to report). Throws if
 * META_CONVERSIONS_DATASET_ID isn't configured — callers should treat this
 * as best-effort and not fail a lead's local status update because of it.
 */
export async function sendLeadStatusEvent(metaLeadId: string, status: string): Promise<void> {
  const eventName = STATUS_EVENT_NAME[status];
  if (!eventName) return;

  const { accessToken, datasetId } = requireMetaConversionsEnv();
  await graphPost(`${datasetId}/events`, accessToken, {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "system_generated",
        lead_id: metaLeadId,
      },
    ],
  });
}
