"use client";
import { useMemo, type ReactNode } from "react";
import { buildOutreachEmailHtml } from "../../utils/email-html";

const PREVIEW_HEIGHT = 520;

export function EmailPreview({
  subject,
  body,
  ctaText,
  ctaLink,
  headerAction,
}: {
  subject: string;
  body: string;
  ctaText?: string | null;
  ctaLink?: string | null;
  headerAction?: ReactNode;
}) {
  const html = useMemo(() => buildOutreachEmailHtml(body, ctaText, ctaLink), [body, ctaText, ctaLink]);

  return (
    <div className="rounded-lg overflow-hidden border border-default">
      <div className="px-4 py-2.5 border-b border-default bg-surface/60 flex items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <p className="text-[11px] font-bold text-muted uppercase tracking-wide">Subject</p>
          <p className="text-sm font-semibold text-text truncate">{subject}</p>
        </div>
        {headerAction}
      </div>
      <iframe
        srcDoc={html}
        title="Email preview"
        sandbox=""
        className="w-full block"
        style={{ height: PREVIEW_HEIGHT, border: "none" }}
      />
    </div>
  );
}
