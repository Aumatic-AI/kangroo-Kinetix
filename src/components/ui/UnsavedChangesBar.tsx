"use client";
import { Button } from "./Button";

/**
 * The one floating "you have unsaved changes" bar — appears only while
 * `open` is true (the caller decides that from its own dirty-state
 * comparison) and sticks near the bottom of the viewport while scrolling.
 * Deliberately the only save affordance on a settings-style page: no
 * always-visible Save button elsewhere, so there's nothing to click when
 * there's nothing to save.
 */
export function UnsavedChangesBar({
  open,
  onSave,
  onDiscard,
  saving,
}: {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saving?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="sticky bottom-6 z-10 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-4 bg-background border border-border shadow-lg rounded-lg pl-4 pr-3 py-3">
        <p className="text-sm font-medium text-text whitespace-nowrap">You have unsaved changes</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onDiscard} disabled={saving}>Discard</Button>
          <Button size="sm" onClick={onSave} loading={saving}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
}
