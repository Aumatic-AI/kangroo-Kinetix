import Link from "next/link";
import { SECONDARY_NAV_ITEMS } from "@/config/navigation";
import { ProductModule } from "@/types";
import { MODULES } from "@/config/modules";

interface SecondarySidebarProps {
  currentModule: ProductModule;
  currentPath: string;
}

export function SecondarySidebar({ currentModule, currentPath }: SecondarySidebarProps) {
  const items = SECONDARY_NAV_ITEMS[currentModule] || [];
  const moduleInfo = MODULES[currentModule];

  if (items.length === 0) return null;

  return (
    <aside className="w-56 h-full bg-background border-r border-border flex flex-col flex-shrink-0 z-base animate-slide-in">
      <div className="h-14 px-4 flex items-center border-b border-border flex-shrink-0">
        <h2 className="font-semibold text-sm text-text">
          {moduleInfo?.name || ""}
        </h2>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-3 flex flex-col gap-1">
        {items.map((item) => {
          const isActive = currentPath === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-muted ${
                isActive ? "bg-secondary-hover" : "hover:bg-secondary-hover hover:text-text"
              }`}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
