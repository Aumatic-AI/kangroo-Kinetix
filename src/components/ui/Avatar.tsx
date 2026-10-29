import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AvatarProps {
  icon?: LucideIcon;
  label?: string;
  className?: string;
}

export function Avatar({ icon: Icon, label, className }: AvatarProps) {
  const letter = label?.trim()?.[0]?.toUpperCase() || "?";

  return (
    <div
      className={cn(
        "flex items-center justify-center w-9 h-9 rounded-lg bg-secondary border border-default text-muted shrink-0",
        className
      )}
    >
      {Icon ? <Icon className="w-4 h-4" /> : <span className="text-xs font-bold">{letter}</span>}
    </div>
  );
}
