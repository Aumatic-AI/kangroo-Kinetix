import {
  LayoutDashboard,
  Megaphone,
  Send,
  Settings,
  Link,
  Building2,
  Images,
  SlidersHorizontal,
  BarChart3,
} from "lucide-react";
import { NavItem, NavSection } from "@/types";
import { ROUTES } from "./routes";

/**
 * The sidebar: ONE level. Links are grouped under non-clickable section
 * captions by what you're doing, never nested. Labels are unique across the
 * whole list and match each page's own title. A new page needs an entry in both
 * `ROUTES` and here, or its link won't exist.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    items: [
      { id: "dashboard", label: "Dashboard", href: ROUTES.DASHBOARD.HOME, icon: LayoutDashboard },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { id: "content-gallery", label: "Content Gallery", href: ROUTES.CONTENT.GALLERY, icon: Images },
      { id: "listings", label: "Listings", href: ROUTES.LISTINGS.ROOT, icon: Building2 },
      { id: "automation", label: "Automation", href: ROUTES.CONTENT.AUTOMATION, icon: SlidersHorizontal },
    ],
  },
  {
    id: "social",
    label: "Social",
    items: [
      { id: "posts", label: "Posts", href: ROUTES.SOCIAL.POSTS, icon: Megaphone },
      { id: "published", label: "Published", href: ROUTES.SOCIAL.PUBLISHED, icon: Send },
      { id: "social-analytics", label: "Social Analytics", href: ROUTES.SOCIAL.DASHBOARD, icon: BarChart3 },
      { id: "connected-accounts", label: "Connected Accounts", href: ROUTES.SOCIAL.CONNECTED_ACCOUNTS, icon: Link },
    ],
  },
];

/** Pinned to the bottom of the sidebar, below a divider. */
export const NAV_FOOTER_ITEMS: NavItem[] = [
  { id: "settings", label: "Settings", href: ROUTES.SETTINGS.ROOT, icon: Settings },
];

/** Every link, in display order — used to resolve the active item. */
export const ALL_NAV_ITEMS: NavItem[] = [...NAV_SECTIONS.flatMap((s) => s.items), ...NAV_FOOTER_ITEMS];
