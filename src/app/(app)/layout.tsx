"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { SessionBootstrap } from "@/components/providers/SessionBootstrap";
import { Toaster } from "sonner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <SessionBootstrap />
      <Navbar />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>

      <Toaster richColors position="bottom-left" />
    </div>
  );
}
