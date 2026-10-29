import { NextResponse } from "next/server";
import { requireMetaPageEnv, graphGet, graphPost } from "@/services/meta/graph-client";
import type { LeadForm, CreateLeadFormInput } from "@/modules/meta-ads/hooks/useLeads";

/**
 * Instant Forms live entirely on Meta — no local table for them (unlike
 * campaigns/ads, there's nothing about a form we need to know when Meta is
 * unreachable, and they change rarely). Same Page-scoped token as the
 * webhook/leads routes, not the ad-account token used everywhere else in
 * this module. Archived forms are included (not filtered out) so one can
 * still be viewed after archiving — Meta has no un-archive for forms (same
 * one-way ARCHIVED-as-delete pattern as campaigns/ad sets/ads), so this is
 * the only way to see it again.
 */
const FORM_FIELDS = "id,name,status,locale,leads_count,created_time,questions,privacy_policy_url,is_optimized_for_quality,context_card,thank_you_page";

/** ?formId=X fetches just that one form directly by ID (e.g. the Ad Detail
 * page showing the single Instant Form a given ad is linked to) instead of
 * pulling the whole account's form list — which only grows over time since
 * Meta has no true delete for forms, just ARCHIVED. */
export async function GET(request: Request) {
  try {
    const { pageId, pageToken } = requireMetaPageEnv();
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get("formId");

    if (formId) {
      const form = await graphGet<LeadForm>(formId, pageToken, { fields: FORM_FIELDS });
      return NextResponse.json({ form });
    }

    const data = await graphGet<{ data?: LeadForm[] }>(`${pageId}/leadgen_forms`, pageToken, { fields: FORM_FIELDS });
    return NextResponse.json({ forms: data.data || [] });
  } catch (error: any) {
    console.error("[META_ADS_LEAD_FORMS_LIST]", error);
    return NextResponse.json({ error: error.message || "Failed to load lead forms" }, { status: 500 });
  }
}

// Keep in sync with STANDARD_QUESTIONS in CreateLeadFormModal.tsx — this is
// the server-side allowlist actually sent to Meta; the modal's list is just
// what's offered in the UI.
const STANDARD_TYPES = new Set([
  "FULL_NAME", "FIRST_NAME", "LAST_NAME", "EMAIL", "PHONE",
  "CITY", "STATE", "COUNTRY", "ZIP_CODE", "STREET_ADDRESS",
  "DOB", "GENDER", "COMPANY_NAME", "JOB_TITLE", "WORK_EMAIL", "WORK_PHONE_NUMBER",
]);

export async function POST(request: Request) {
  try {
    const { pageId, pageToken } = requireMetaPageEnv();
    const body = (await request.json()) as CreateLeadFormInput;

    if (!body.name?.trim()) return NextResponse.json({ error: "Form name is required" }, { status: 400 });
    if (!body.privacyPolicyUrl?.trim()) return NextResponse.json({ error: "Privacy Policy URL is required" }, { status: 400 });

    const questions: { type: string; label?: string }[] = [];
    for (const type of body.standardQuestions || []) {
      if (STANDARD_TYPES.has(type)) questions.push({ type });
    }
    for (const label of body.customQuestions || []) {
      if (label?.trim()) questions.push({ type: "CUSTOM", label: label.trim() });
    }
    if (questions.length === 0) return NextResponse.json({ error: "At least one question is required" }, { status: 400 });

    const graphBody: Record<string, unknown> = {
      name: body.name.trim(),
      questions,
      privacy_policy: {
        url: body.privacyPolicyUrl.trim(),
        link_text: body.privacyPolicyLinkText?.trim() || "Privacy Policy",
      },
      locale: body.locale || "EN_US",
    };

    // Optional intro screen shown before the questions.
    if (body.contextCardEnabled && body.contextCardTitle?.trim()) {
      graphBody.context_card = {
        title: body.contextCardTitle.trim(),
        content: (body.contextCardContent || "").split("\n").map((line) => line.trim()).filter(Boolean),
        button_text: body.contextCardButtonText?.trim() || "Continue",
      };
    }

    // Thank-you screen after submission — either a "visit website" button or none at all.
    if (body.thankYouButtonType === "VIEW_WEBSITE" && body.thankYouWebsiteUrl?.trim()) {
      graphBody.thank_you_page = {
        title: body.thankYouTitle?.trim() || "Thank you!",
        body: body.thankYouBody?.trim() || "We'll be in touch soon.",
        button_type: "VIEW_WEBSITE",
        website_url: body.thankYouWebsiteUrl.trim(),
        button_text: body.thankYouButtonText?.trim() || "Visit Website",
      };
    } else if (body.thankYouButtonType === "NONE") {
      graphBody.thank_you_page = {
        title: body.thankYouTitle?.trim() || "Thank you!",
        body: body.thankYouBody?.trim() || "We'll be in touch soon.",
        button_type: "NONE",
      };
    }

    // Meta's own ML-based filter for low-quality/likely-fake submissions.
    if (body.isOptimizedForQuality) graphBody.is_optimized_for_quality = true;

    const created = await graphPost<{ id: string }>(`${pageId}/leadgen_forms`, pageToken, graphBody);

    return NextResponse.json({ success: true, id: created.id, name: body.name.trim() });
  } catch (error: any) {
    console.error("[META_ADS_LEAD_FORMS_CREATE]", error);
    return NextResponse.json({ error: error.message || "Failed to create lead form" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { pageToken } = requireMetaPageEnv();
    const { searchParams } = new URL(request.url);
    const formId = searchParams.get("formId");
    if (!formId) return NextResponse.json({ error: "formId is required" }, { status: 400 });

    // Meta doesn't support HTTP DELETE on lead gen forms — set status to
    // ARCHIVED instead. This is not reversible via the API (same as
    // campaigns/ad sets/ads), so there's no "unarchive" action to offer.
    await graphPost(formId, pageToken, { status: "ARCHIVED" });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[META_ADS_LEAD_FORMS_DELETE]", error);
    return NextResponse.json({ error: error.message || "Failed to archive lead form" }, { status: 500 });
  }
}
