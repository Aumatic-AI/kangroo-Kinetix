"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS, NAV_FOOTER_ITEMS, ALL_NAV_ITEMS } from "@/config/navigation";
import { findActiveHref } from "@/config/nav-active";
import type { NavItem } from "@/types";

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 px-3 h-9 rounded-lg text-sm transition-colors ${
        active ? "bg-secondary-hover text-text font-medium" : "text-muted hover:bg-secondary-hover hover:text-text"
      }`}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * The app's one sidebar: a single level of links grouped under small section
 * captions (never nested), with Settings pinned at the bottom. Fixed width on
 * every page, so content never shifts when you move between areas.
 */
export function Sidebar() {
  const pathname = usePathname();
  const activeHref = findActiveHref(pathname, ALL_NAV_ITEMS.map((i) => i.href));

  return (
    <aside
      className="h-full flex-shrink-0 bg-background border-r border-border flex flex-col z-base"
      style={{ width: "var(--sidebar-width)" }}
    >
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.id} className="flex flex-col gap-1">
            {section.label && (
              <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted">{section.label}</p>
            )}
            {section.items.map((item) => <NavLink key={item.id} item={item} active={item.href === activeHref} />)}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-border flex flex-col gap-1">
        {NAV_FOOTER_ITEMS.map((item) => <NavLink key={item.id} item={item} active={item.href === activeHref} />)}
      </div>
    </aside>
  );
}
