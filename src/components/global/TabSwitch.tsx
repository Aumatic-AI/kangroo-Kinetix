"use client";
import { ReactNode, useId } from "react";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabSwitchItem {
  value: string;
  label: ReactNode;
  icon?: LucideIcon;
  count?: number;
  disabled?: boolean;
}

export interface TabSwitchProps {
  items: TabSwitchItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  /** "md" matches the segmented pill tabs on the Leads page exactly (the
   * default everywhere); "sm" is a denser variant for rows with more tabs
   * or less horizontal room. */
  size?: "sm" | "md";
}

/**
 * The segmented-pill tab switcher — same look as the Leads/Instant Forms
 * tabs it was extracted from (bg-surface track, rounded-md pills, primary-
 * colored active tab), now shared everywhere a tab switcher looks like
 * this instead of the default underline Tabs. The active pill is a single
 * framer-motion element with a shared layoutId, so switching tabs slides
 * the highlight to its new position/width instead of just recoloring —
 * layoutId is scoped to one useId() per instance, so multiple TabSwitches
 * on the same page never cross-animate each other's highlight.
 *
 * Deliberately standalone (plain value/onValueChange state, not built on
 * Base UI's Tabs.Root) — pair it with your own conditional rendering for
 * panel content instead of the shared ui/tabs.tsx's TabsContent, which
 * only works inside that other Tabs system.
 */
export function TabSwitch({ items, value, onValueChange, className, size = "md" }: TabSwitchProps) {
  const groupId = useId();
  const padding = size === "sm" ? "px-2.5 py-1" : "px-3 py-1.5";

  return (
    <div className={cn("inline-flex items-center gap-1 bg-surface rounded-lg p-1", className)}>
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            disabled={item.disabled}
            onClick={() => !item.disabled && onValueChange(item.value)}
            className={cn("relative rounded-md text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed", padding)}
          >
            {active && (
              <motion.span
                layoutId={`tab-switch-highlight-${groupId}`}
                className="absolute inset-0 rounded-md bg-primary"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className={cn("relative z-10 flex items-center gap-1.5", active ? "text-white" : "text-muted")}>
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {item.label}
              {item.count !== undefined && (
                <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-bold leading-none", active ? "bg-white/25 text-white" : "bg-white text-muted border border-default")}>
                  {item.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
