"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Error Caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-center px-4 animate-fade-in">
      <div className="w-16 h-16 flex items-center justify-center text-danger mb-4">
        <AlertTriangle size={48} />
      </div>
      <h1 className="text-2xl font-bold text-text mb-2">Something went wrong!</h1>
      <p className="text-muted mb-8 max-w-md">
        An unexpected error occurred. We've been notified and are looking into it.
      </p>
      <Button
        variant="secondary"
        size="lg"
        onClick={() => reset()}
      >
        Try again
      </Button>
    </div>
  );
}
