"use client";
import { formatDate } from "@/utils/datetime";
import { Loader } from "@/components/ui/Loader";
import { Pill } from "@/modules/listings/components/ListingBits";
import { useActivity } from "../hooks/useContent";
import { TYPE_LABEL } from "../lib/format";

const TONE = { completed: "success", processing: "warning", pending: "warning", failed: "danger", cancelled: "neutral" } as const;
const LABEL = { completed: "Done", processing: "Generating", pending: "Queued", failed: "Failed", cancelled: "Cancelled" } as const;

/** Latest generation jobs. Only shows when something is running or has failed — a click on
 * "Generate now" is visible straight away, and a failure is never silent. */
export function ActivityPanel() {
  const { data } = useActivity();
  const cycle = data?.cycles[0];
  const jobs = (data?.jobs ?? []).filter((j) => j.status !== "completed" && j.status !== "cancelled").slice(0, 8);
  if (!cycle || !jobs.length) return null;

  return (
    <div className="border border-default rounded-lg overflow-hidden">
      <div className="px-4 h-10 flex items-center justify-between bg-surface">
        <p className="text-xs font-medium text-muted uppercase">Generation activity</p>
        <p className="text-xs text-muted">Week of {formatDate(cycle.weekStart)}</p>
      </div>
      <ul>
        {jobs.map((j) => (
          <li key={j.id} className="px-4 py-3 border-t border-default flex items-start gap-3">
            <div className="pt-0.5 w-4 shrink-0">{(j.status === "processing" || j.status === "pending") && <Loader size="sm" />}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text truncate">
                {j.propertyTitle ?? "Choosing a property…"}
                <span className="text-muted font-normal"> · {j.pipeline === "linkedin" ? "LinkedIn" : j.pipeline === "blog" ? "Blog" : "Social"}{j.contentType ? ` · ${TYPE_LABEL[j.contentType]}` : ""}</span>
              </p>
              {/* The queue keeps the LAST error until the job ends: only a failed job shows it as an error;
                  a job that is running or waiting to retry shows it as the previous attempt's reason. */}
              {j.error && (j.status === "failed"
                ? <p className="text-xs text-danger mt-0.5 break-words">{j.error}</p>
                : <p className="text-xs text-muted mt-0.5 break-words">Previous attempt: {j.error}</p>)}
              {j.status === "pending" && j.attempts > 0 && <p className="text-xs text-muted mt-0.5">Retrying (attempt {j.attempts} of {j.maxAttempts})</p>}
            </div>
            <Pill tone={TONE[j.status]}>{LABEL[j.status]}</Pill>
          </li>
        ))}
      </ul>
    </div>
  );
}
