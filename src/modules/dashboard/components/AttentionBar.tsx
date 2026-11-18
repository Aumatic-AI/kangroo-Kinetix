import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowRight } from "lucide-react";
import { ROUTES } from "@/config/routes";
import type { AttentionHref, AttentionItem } from "../lib/attention";

const HREF: Record<AttentionHref, { href: string; label: string }> = {
  gallery: { href: ROUTES.CONTENT.GALLERY, label: "Content Gallery" },
  automation: { href: ROUTES.CONTENT.AUTOMATION, label: "Automation" },
  accounts: { href: ROUTES.SOCIAL.CONNECTED_ACCOUNTS, label: "Connected Accounts" },
  posts: { href: ROUTES.SOCIAL.POSTS, label: "Posts" },
  posts_failed: { href: `${ROUTES.SOCIAL.POSTS}?status=failed`, label: "Failed posts" },
  posts_scheduled: { href: `${ROUTES.SOCIAL.POSTS}?status=scheduled`, label: "Scheduled posts" },
};

/**
 * Everything that needs a person, errors first, each with its reason (the latest
 * underlying error, verbatim) and where to fix it. Rendered only when non-empty.
 */
export function AttentionBar({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null;
  const errors = items.filter((i) => i.severity === "error").length;
  return (
    <div className={`border rounded-lg px-4 py-3 space-y-2 ${errors ? "bg-danger-bg border-danger" : "bg-warning-bg border-default"}`}>
      <p className="flex items-center gap-2 text-sm font-semibold text-text">
        {errors ? <AlertCircle className="w-4 h-4 text-danger" /> : <AlertTriangle className="w-4 h-4 text-warning" />}
        Needs attention
        <span className="text-xs font-normal text-muted">
          {errors ? `${errors} error${errors === 1 ? "" : "s"}` : ""}{errors && items.length > errors ? " · " : ""}
          {items.length > errors ? `${items.length - errors} warning${items.length - errors === 1 ? "" : "s"}` : ""}
        </span>
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={`${item.kind}-${item.message}`} className="flex items-start justify-between gap-3 text-sm">
            <div className="flex items-start gap-2 min-w-0">
              {item.severity === "error"
                ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-danger" />
                : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning" />}
              <div className="min-w-0">
                <p className="text-text">{item.message}</p>
                {item.detail && <p className="text-xs text-muted break-words">Latest error: {item.detail}</p>}
              </div>
            </div>
            {item.href && (
              <Link href={HREF[item.href].href} className="flex items-center gap-1 text-xs font-medium text-text underline underline-offset-2 whitespace-nowrap">
                {HREF[item.href].label} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
