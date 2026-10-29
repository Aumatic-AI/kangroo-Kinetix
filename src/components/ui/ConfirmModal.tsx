"use client";
import { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./dialog";
import { Button } from "./Button";

export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Optional richer content below the description — a details list, etc.
   * Rendered as a plain block, never nested inside DialogDescription (which
   * renders a <p> and can't safely contain block-level children like <div>/<ul>). */
  details?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "destructive" for irreversible/dangerous actions (delete), "primary" for reversible ones (pause). */
  variant?: "primary" | "destructive";
  /** While true: confirm button shows a spinner, Cancel is disabled, and the
   * dialog can't be dismissed by backdrop/Escape — the caller decides when
   * the action actually finished and only then flips `open` to false. */
  loading?: boolean;
  /** Shown inline when the action failed — the dialog stays open so the user can retry. */
  error?: string;
  onConfirm: () => void;
}

/** Generic reusable confirmation dialog for any destructive or important
 * action (delete, pause, send, etc.) — built on the shared Dialog primitives
 * so it matches every other modal in the app. Fully controlled: the caller
 * owns `open` state and decides what `onConfirm` actually does, and must not
 * close the dialog until the action has actually finished. */
export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  details,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  loading,
  error,
  onConfirm,
}: ConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {details}
        {error && <p className="text-sm text-danger font-medium">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{cancelLabel}</Button>
          <Button variant={variant === "destructive" ? "destructive" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
