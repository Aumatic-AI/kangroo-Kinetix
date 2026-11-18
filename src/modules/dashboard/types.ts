import type { AttentionItem } from "./lib/attention";

/** Date ranges for the Dashboard. From 30 days on, the label is in months. */
export const DASHBOARD_RANGES = {
  "7d": { days: 7, label: "7 days" },
  "14d": { days: 14, label: "14 days" },
  "30d": { days: 30, label: "1 month" },
  "90d": { days: 90, label: "3 months" },
  "180d": { days: 180, label: "6 months" },
} as const;
export type DashboardRange = keyof typeof DASHBOARD_RANGES;

export interface DashboardData {
  range: DashboardRange;
  rangeDays: number;
  /** Live from Upload-Post. `available` is false when nothing could be loaded (no accounts, or Upload-Post failed). */
  analytics: {
    available: boolean;
    kpis: {
      /** Now, across all connected accounts. */
      followers: number | null;
      /** Over the selected range. */
      impressions: number | null;
      /** Unique accounts reached, as each platform reports it now. */
      reach: number | null;
      /** Likes + comments + shares + saves, as each platform reports it now. */
      engagement: number | null;
      connectedAccounts: number;
    };
    impressionsTrend: { date: string; impressions: number }[];
    impressionsByPlatform: { platform: string; impressions: number }[];
    platformComparison: { platform: string; followers: number; reach: number; engagement: number }[];
    engagementBreakdown: { type: string; value: number }[];
    platformHealth: { platform: string; status: string }[];
    audienceDemographics: { age: Record<string, number>; gender: Record<string, number> } | null;
  };
  /** From the database. Null when automation has never been set up. */
  automation: {
    mode: "testing" | "live";
    isEnabled: boolean;
    autoRunEnabled: boolean;
    timezone: string;
    /** Next Friday 18:00 (Toronto) run, when automatic runs are on and automation is enabled. */
    nextRunAt: string | null;
    cycle: { weekStart: string; environment: "testing" | "live"; total: number; completed: number; failed: number; inProgress: number } | null;
    upcoming: { platform: string; at: string; timezone: string; held: boolean; title: string; contentId: string }[];
    recent: { platform: string; at: string; url: string | null; title: string; contentId: string }[];
  } | null;
  /** Set when the automation half couldn't be loaded (it's then null for that reason, not "not set up"). */
  automationError: string | null;
  /** Everything that needs a person, errors first. Empty when all is well. */
  attention: AttentionItem[];
}
