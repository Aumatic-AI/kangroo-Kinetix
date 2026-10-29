function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}

/** Wraps the AI-generated plain-text subject/body into a real HTML email
 * layout for preview — the outreach send pipeline (Instantly) still sends
 * generated_body as-is; this is presentation only, so it doesn't touch the
 * generation prompt or the send job. */
export function buildOutreachEmailHtml(body: string, ctaText?: string | null, ctaLink?: string | null): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const button = ctaText
    ? `<div style="margin-top:8px;"><a href="${ctaLink ? escapeAttr(ctaLink) : "#"}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${escapeHtml(ctaText)}</a></div>`
    : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body { margin: 0; padding: 0; background: #f1f5f9; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
</style>
</head>
<body>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          <tr>
            <td style="padding:32px 36px;">
              ${paragraphs}
              ${button}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
