import Link from "next/link";
import { Hexagon } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4 animate-fade-in">
      <div className="w-16 h-16 bg-logo rounded-xl flex items-center justify-center text-white shadow-md mb-6">
        <Hexagon size={32} fill="currentColor" />
      </div>
      <h1 className="text-4xl font-bold text-text mb-2">404 - Not Found</h1>
      <p className="text-muted mb-8 max-w-md">
        The page you are looking for doesn't exist or has been moved.
      </p>
      <Button asChild size="lg">
        <Link href="/dashboard">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
