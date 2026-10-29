"use client";
import { useParams } from "next/navigation";
import { AdStudioComposer } from "../components/ad-studio/AdStudioComposer";
import { AdStudioThread } from "../components/ad-studio/AdStudioThread";

export function AdStudioPage() {
  const { sessionId } = useParams<{ sessionId?: string }>();

  return (
    <div className="h-full bg-background">
      {sessionId ? <AdStudioThread sessionId={sessionId} /> : <AdStudioComposer />}
    </div>
  );
}
