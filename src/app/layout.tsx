import { Inter, Geist } from "next/font/google";
import { QueryProvider } from "@/components/providers/QueryProvider";
import "@/styles/globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: "Kinetix | AI Automation Platform",
  description: "Unified marketing and automation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className={`${geist.variable} font-sans antialiased animate-fade-in`}>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
