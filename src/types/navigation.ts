import { LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

/** A group of sidebar links under an optional, non-clickable caption. */
export interface NavSection {
  id: string;
  label?: string;
  items: NavItem[];
}
