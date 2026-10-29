import { useQuery } from "@tanstack/react-query";
import { UsageResponse } from "@/app/api/usage/route";

async function fetchUsage(month: string): Promise<UsageResponse> {
  const res = await fetch(`/api/usage?month=${month}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load usage");
  return data;
}

/** Real generation counts for the given month (YYYY-MM), combined with the
 * modeled per-unit rates in src/lib/costEstimates.ts — an estimate, not a
 * measurement of actual provider spend. Backs Settings > Usage. */
export function useUsage(month: string) {
  return useQuery({
    queryKey: ["usage", month],
    queryFn: () => fetchUsage(month),
    staleTime: 60_000,
  });
}
