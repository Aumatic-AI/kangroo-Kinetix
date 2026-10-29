import { Posts } from "@/modules/social/pages/Posts";

export default function Page() {
  return <Posts heading="Published" description="Everything that's live on your connected accounts." defaultFilter="published" />;
}
