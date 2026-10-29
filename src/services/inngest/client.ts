import { Inngest } from "inngest";
import { env } from "@/config";

// Create a client to send and receive events
export const inngest = new Inngest({
  id: "kinetix-app",
  eventKey: env.INNGEST_EVENT_KEY || "local",
});
