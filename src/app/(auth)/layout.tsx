import { Hexagon } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-full overflow-y-auto flex items-center justify-center bg-surface py-8">
      <div className="w-full max-w-md p-8 bg-background rounded-lg shadow-md border border-default animate-fade-in my-auto">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-primary rounded-md flex items-center justify-center text-white font-bold text-2xl">
            <Hexagon size={24} fill="currentColor" />
          </div>
          <span className="font-bold text-lg text-text tracking-tight">Kinetix</span>
        </div>
        {children}
      </div>
    </div>
  );
}
