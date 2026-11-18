import { redirect } from "next/navigation";
import { ROUTES } from "@/config/routes";

/** Social Analytics was merged into the Dashboard; old links and bookmarks land there. */
export default function Page() {
  redirect(ROUTES.DASHBOARD.HOME);
}
