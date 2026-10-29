import Link from "next/link";
import { PRIMARY_NAV_ITEMS } from "@/config/navigation";
import { ProductModule } from "@/types";

interface PrimarySidebarProps {
  currentModule?: ProductModule;
  hasSecondary?: boolean;
}

export function PrimarySidebar({ currentModule, hasSecondary }: PrimarySidebarProps) {
  // Dashboard and Settings both have no secondary sidebar, so the primary
  // one stays permanently expanded (full labels visible) instead of the
  // icon-only, hover-to-expand behavior every other module uses.
  const isExpanded = currentModule === "dashboard" || currentModule === "settings";

  return (
    <>
      <div className={`${isExpanded ? "w-64" : "w-16"} flex-shrink-0 h-full bg-surface z-base transition-all`} />

      <aside className={`fixed left-0 top-15 ${isExpanded ? "w-64" : "w-16 hover:w-64"} h-[calc(100vh-58px)] bg-background flex flex-col z-50 transition-all overflow-hidden group border-r border-border`}>
        <nav className="flex flex-col gap-1 w-full px-3 py-4">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const isActive = currentModule === item.module;
            const Icon = item.icon;
            
            return (
              <Link 
                key={item.id}
                href={item.href}
                className={`h-11 rounded-lg flex items-center transition-colors overflow-hidden flex-shrink-0 text-muted ${
                  isActive ? "bg-secondary" : "hover:bg-secondary hover:text-text"
                }`}
                title={item.label}
              >
                <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                  <Icon size={20} />
                </div>
                <span className={`whitespace-nowrap text-sm transition-opacity ${isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
