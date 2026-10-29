"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  required?: boolean;
  className?: string;
}

/**
 * A styled dropdown built on Base UI's own Select (@base-ui/react/select) —
 * not a native <select>, and not the Radix-based @/components/ui/select.
 * Base UI's Select and Dialog share the same dismiss-stack internals, so
 * opening this inside a Dialog (e.g. CreateAdModal) doesn't trigger the
 * Dialog's outside-press handling the way mixing in a Radix Select did.
 */
export function Dropdown({
  options,
  value,
  onValueChange,
  placeholder,
  error,
  disabled,
  name,
  id,
  required,
  className,
}: DropdownProps) {
  return (
    <SelectPrimitive.Root
      items={options}
      value={value ?? null}
      onValueChange={(val) => {
        if (val !== null) onValueChange?.(val as string);
      }}
      disabled={disabled}
      name={name}
      required={required}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          "flex h-[46px] w-full items-center justify-between rounded-lg border bg-background px-4 py-3 text-sm text-text outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-danger focus:ring-danger/20 focus:border-danger" : "border-border",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner className="isolate z-50 outline-none" sideOffset={4}>
          <SelectPrimitive.Popup className="max-h-96 w-(--anchor-width) min-w-[180px] overflow-y-auto rounded-lg border border-border bg-background p-1 text-text shadow-md outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <SelectPrimitive.List>
              {options.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className="relative flex w-full cursor-default select-none items-center rounded-md h-10 px-3 text-sm outline-none data-highlighted:bg-surface data-highlighted:text-text data-disabled:pointer-events-none data-disabled:opacity-50 data-selected:font-bold"
                >
                  <span className="absolute right-3 flex h-3.5 w-3.5 items-center justify-center text-text">
                    <SelectPrimitive.ItemIndicator>
                      <Check className="h-4 w-4" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
