import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  // Since we aren't using tailwind in the strict sense, twMerge isn't strictly necessary, 
  // but it's safe to include alongside clsx for conditional class merging.
  return twMerge(clsx(inputs));
}
