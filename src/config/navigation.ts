import {
  LayoutDashboard,
  Megaphone,
  Send,
  Share2,
  Settings,
  Users,
  BookOpen,
  Link,
  PlayCircle,
  FileText,
} from "lucide-react";
import { NavItem, ProductModule } from "@/types";
import { ROUTES } from "./routes";

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: ROUTES.DASHBOARD.HOME,
    icon: LayoutDashboard,
    module: "dashboard",
  },
  {
    id: "metaAds",
    label: "Meta Ads",
    href: ROUTES.META_ADS.DASHBOARD,
    icon: Megaphone,
    module: "metaAds",
  },
  {
    id: "social",
    label: "Social Media",
    href: ROUTES.SOCIAL.DASHBOARD,
    icon: Share2,
    module: "social",
  },
  {
    id: "outreach",
    label: "Outreach",
    href: ROUTES.OUTREACH.DASHBOARD,
    icon: Send,
    module: "outreach",
  },
  {
    id: "settings",
    label: "Settings",
    href: ROUTES.SETTINGS.ROOT,
    icon: Settings,
    module: "settings",
  },
];

export const SECONDARY_NAV_ITEMS: Record<
  ProductModule,
  Omit<NavItem, "module">[]
> = {
  dashboard: [],
  metaAds: [
    {
      id: "ma-dashboard",
      label: "Dashboard",
      href: ROUTES.META_ADS.DASHBOARD,
      icon: LayoutDashboard,
    },
    {
      id: "ma-library",
      label: "Ad Library",
      href: ROUTES.META_ADS.AD_LIBRARY,
      icon: BookOpen,
    },
    {
      id: "ma-campaigns",
      label: "Campaigns",
      href: ROUTES.META_ADS.CAMPAIGNS,
      icon: PlayCircle,
    },
    {
      id: "ma-reports",
      label: "Reports",
      href: ROUTES.META_ADS.REPORTS,
      icon: FileText,
    },
    {
      id: "ma-leads",
      label: "Lead Responses",
      href: ROUTES.META_ADS.LEADS,
      icon: Users,
    },
  ],
  outreach: [
    {
      id: "or-dashboard",
      label: "Dashboard",
      href: ROUTES.OUTREACH.DASHBOARD,
      icon: LayoutDashboard,
    },
    {
      id: "or-leads",
      label: "Leads",
      href: ROUTES.OUTREACH.LEADS,
      icon: Users,
    },
    {
      id: "or-campaigns",
      label: "Campaigns",
      href: ROUTES.OUTREACH.CAMPAIGNS,
      icon: Megaphone,
    },
  ],
  social: [
    {
      id: "sm-dashboard",
      label: "Dashboard",
      href: ROUTES.SOCIAL.DASHBOARD,
      icon: LayoutDashboard,
    },
    {
      id: "sm-posts",
      label: "Gallery",
      href: ROUTES.SOCIAL.POSTS,
      icon: Megaphone,
    },
    {
      id: "sm-published",
      label: "Published",
      href: ROUTES.SOCIAL.PUBLISHED,
      icon: Send,
    },
    {
      id: "sm-accounts",
      label: "Connected Accounts",
      href: ROUTES.SOCIAL.CONNECTED_ACCOUNTS,
      icon: Link,
    },
  ],
  // Settings is a single flat page (no sub-tabs) — everything lives on
  // /settings itself, organized by in-page Tabs instead of a secondary
  // sidebar. SecondarySidebar already renders nothing when its module's
  // list is empty (same as "dashboard").
  settings: [],
};
