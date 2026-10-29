import { LucideIcon } from "lucide-react";

export type ProductModule = "dashboard" | "metaAds" | "outreach" | "social" | "settings";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  module: ProductModule;
}
