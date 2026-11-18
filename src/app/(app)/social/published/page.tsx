import { redirect } from "next/navigation";
import { ROUTES } from "@/config/routes";

/** "Published" was the Posts page on another tab; old links and bookmarks land on that tab. */
export default function Page() {
  redirect(`${ROUTES.SOCIAL.POSTS}?status=published`);
}
