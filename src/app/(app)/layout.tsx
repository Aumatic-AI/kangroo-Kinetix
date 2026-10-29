"use client";

import { usePathname } from "next/navigation";
import { PrimarySidebar } from "@/components/layout/PrimarySidebar";
import { SecondarySidebar } from "@/components/layout/SecondarySidebar";
import { Navbar } from "@/components/layout/Navbar";
import { SessionBootstrap } from "@/components/providers/SessionBootstrap";
import { Toaster } from "sonner";
import { ProductModule } from "@/types";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Basic routing logic to determine current module
  let currentModule: ProductModule = "dashboard";
  if (pathname.startsWith("/meta-ads")) currentModule = "metaAds";
  else if (pathname.startsWith("/outreach")) currentModule = "outreach";
  else if (pathname.startsWith("/social")) currentModule = "social";
  else if (pathname.startsWith("/settings")) currentModule = "settings";

  // AI Ad Studio is a full-bleed chat surface — it manages its own internal
  // scroll region and floating input, so it skips the page's usual padding/
  // max-width/scroll container instead of nesting a second scrollbar inside them.
  const isFullBleed = pathname.startsWith("/meta-ads/ad-library/studio");

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <SessionBootstrap />
      <Navbar />
      
      <div className="flex flex-1 overflow-hidden">
        <PrimarySidebar currentModule={currentModule} hasSecondary={currentModule !== "dashboard"} />
        
        {currentModule !== "dashboard" && (
          <SecondarySidebar currentModule={currentModule} currentPath={pathname} />
        )}
        
        <main className={isFullBleed ? "flex-1 overflow-hidden" : "flex-1 overflow-auto p-6"}>
          <div className={isFullBleed ? "h-full" : "max-w-7xl mx-auto h-full"}>
            {children}
          </div>
        </main>
      </div>

      <Toaster richColors position="bottom-left" />
    </div>
  );
}
