"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

type PageItem = number | "ellipsis";

/** Always shows page 1 and the last page, plus current ± 1, collapsing any
 * gap into a single "…" per side — e.g. for page=7/totalPages=20:
 * 1 … 6 7 8 … 20. */
function getPageItems(page: number, totalPages: number): PageItem[] {
  const items: PageItem[] = [1];
  if (page > 3) items.push("ellipsis");
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) items.push(p);
  if (page < totalPages - 2) items.push("ellipsis");
  if (totalPages > 1) items.push(totalPages);
  return items;
}

/** The one page-number + prev/next control used everywhere a list is
 * paginated (Meta Ads Campaigns/Reports/Leads/Ad Library, Social Posts,
 * Outreach Leads/Campaigns) — renders nothing for a single page. */
export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={cn("flex items-center justify-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-default text-muted hover:bg-surface hover:text-text disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {getPageItems(page, totalPages).map((item, i) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-muted">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            aria-current={item === page ? "page" : undefined}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors",
              item === page ? "bg-primary text-white" : "text-muted hover:bg-surface hover:text-text"
            )}
          >
            {item}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-default text-muted hover:bg-surface hover:text-text disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
