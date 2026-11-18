import { Suspense } from "react";
import { Posts } from "@/modules/social/pages/Posts";

// Suspense: Posts reads its status tab from the URL (useSearchParams).
export default function Page() {
  return (
    <Suspense>
      <Posts />
    </Suspense>
  );
}
