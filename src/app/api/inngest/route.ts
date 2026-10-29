import { serve } from "inngest/next";
import { inngest } from "@/services/inngest/client";
import { functions } from "@/services/inngest/functions";

// Create an API that serves zero functions (for now)
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
