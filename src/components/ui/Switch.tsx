"use client";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

/** The one toggle-switch control in the app — a track + sliding thumb,
 * built on Base UI's Switch (same pattern as tabs.tsx/dialog.tsx wrapping
 * their own Base UI primitives). Use this instead of a plain checkbox
 * anywhere a setting is a real on/off toggle, not a multi-select. */
export function Switch({
  className,
  checked,
  onCheckedChange,
  disabled,
}: {
  className?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary/20",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "data-[unchecked]:bg-secondary data-[unchecked]:border-border",
        "data-[checked]:bg-primary data-[checked]:border-primary",
        className
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          "translate-x-1 data-[checked]:translate-x-5"
        )}
      />
    </SwitchPrimitive.Root>
  );
}
