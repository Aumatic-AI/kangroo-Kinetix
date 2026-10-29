import { env } from "@/config";

const API_BASE = "https://api.millionverifier.com/api/v3";

export type VerificationResult = "verified" | "invalid" | "catch_all" | "unknown";

/**
 * Ported verbatim from the legacy Outreach n8n workflow's email-verification
 * step: resultcode 1 -> verified, 2 -> catch_all, 5/6/7 -> invalid, else ->
 * unknown. Only "verified" contacts get saved — the rest are surfaced in
 * the scrape job's stats but not persisted as contacts.
 */
export class MillionVerifierService {
  static async verify(email: string): Promise<VerificationResult> {
    const apiKey = env.MILLIONVERIFIER_API_KEY;
    if (!apiKey) throw new Error("MILLIONVERIFIER_API_KEY is not configured");

    const url = new URL(API_BASE);
    url.searchParams.set("api", apiKey);
    url.searchParams.set("email", email);
    url.searchParams.set("timeout", "10");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`MillionVerifier error: ${res.statusText}`);
    const data = await res.json();

    switch (data.resultcode) {
      case 1:
        return "verified";
      case 2:
        return "catch_all";
      case 5:
      case 6:
      case 7:
        return "invalid";
      default:
        return "unknown";
    }
  }
}
