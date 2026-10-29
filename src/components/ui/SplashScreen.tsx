import { Hexagon } from "lucide-react";
import { Loader } from "./Loader";

export function SplashScreen() {
  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-50 animate-fade-in">
      <div className="w-16 h-16 bg-logo rounded-lg flex items-center justify-center text-white mb-4">
        <Hexagon size={32} fill="currentColor" />
      </div>
      <Loader size="md" />
    </div>
  );
}
