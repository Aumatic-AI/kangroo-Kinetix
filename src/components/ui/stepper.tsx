import { cn } from "@/lib/utils";

export interface StepperProps {
  /** Total number of steps. */
  steps: number;
  /** Current step, 1-indexed. */
  current: number;
  /** Optional label shown beside each step's circle, in step order. */
  labels?: string[];
  className?: string;
  /** When provided, a step's circle/label becomes clickable — but only for
   * steps already reached (<= current), so this only ever supports jumping
   * back to a previous step, never skipping ahead of validated ones. */
  onStepClick?: (step: number) => void;
}

/** Numbered-circle progress indicator — filled for the current step and
 * everything before it, hollow gray for what's ahead, connected by a line
 * that follows the same split. Uses the info token rather than primary, so
 * it reads as its own thing and doesn't compete with the page's one
 * primary action button. */
export function Stepper({ steps, current, labels, className, onStepClick }: StepperProps) {
  return (
    <div className={cn("flex items-center w-full", className)}>
      {Array.from({ length: steps }, (_, i) => i + 1).map((step) => {
        const isReached = step <= current;
        const clickable = !!onStepClick && step < current;
        const Circle = (
          <div
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold shrink-0 transition-colors",
              isReached ? "bg-info" : "bg-background border border-default text-muted",
              clickable && "cursor-pointer hover:opacity-80"
            )}
          >
            {step}
          </div>
        );
        const Label = labels?.[step - 1] && (
          <span className={cn("text-base whitespace-nowrap transition-colors", isReached ? "font-semibold text-text" : "font-medium text-muted", clickable && "cursor-pointer hover:opacity-80")}>
            {labels[step - 1]}
          </span>
        );
        return (
          <div key={step} className={cn("flex items-center", step < steps ? "flex-1" : "shrink-0")}>
            {clickable ? (
              <button type="button" onClick={() => onStepClick(step)} className="flex items-center gap-3 shrink-0">
                {Circle}
                {Label}
              </button>
            ) : (
              <div className="flex items-center gap-3 shrink-0">
                {Circle}
                {Label}
              </div>
            )}
            {step < steps && (
              <div className={cn("flex-1 h-0.5 mx-4 rounded-full transition-colors", step < current ? "bg-info" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
