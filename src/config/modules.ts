import { ProductModule } from "@/types";

export const MODULES: Record<
  ProductModule,
  { name: string; description: string; color: string }
> = {
  dashboard: {
    name: "Dashboard",
    description: "Overview of your marketing performance",
    color: "var(--color-primary)",
  },
  metaAds: {
    name: "Meta Ads",
    description: "AI-powered ad generation and management",
    color: "#1877F2",
  },
  outreach: {
    name: "Outreach",
    description: "Automate personalized cold emails",
    color: "#3182CE",
  },
  social: {
    name: "Social Media",
    description: "Generate and schedule social content",
    color: "#DD6B20",
  },
  settings: {
    name: "Settings",
    description: "Manage your Kinetix workspace",
    color: "var(--color-muted)",
  },
};
