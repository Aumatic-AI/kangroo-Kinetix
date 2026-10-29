/** Service name + its Settings description, if set. Gives the AI real
 * context instead of a fixed category label. */
export function serviceDescriptor(business: any, serviceName: any): string {
  if (!serviceName) return "";
  const match = business?.services?.find((s: any) => s?.name === serviceName);
  const description = match?.description;
  return description ? `${serviceName} (${description})` : String(serviceName);
}

/** What to show in a poster's contact strip — the phone if set, else the
 * website with its protocol stripped, else null if neither is on file. */
export function contactDisplayText(business: any): string | null {
  if (business?.contact_phone) return business.contact_phone;
  if (business?.website_url) return String(business.website_url).replace(/^https?:\/\//, "");
  return null;
}

/** The "YOUR BUSINESS: ..." persona block every Meta Ads prompt opens with. */
export function businessContextBlock(business: any): string {
  const name = business?.name || "the business";
  const industry = business?.industry || "this industry";
  const offerings = business?.core_offerings || "Not specified";
  const audience = business?.target_audience || "Not specified";
  const voice = business?.business_voice || "Professional, trustworthy, and clear";
  const painPoints = business?.pain_points || "Not specified";
  const description = business?.description;

  return `YOUR BUSINESS: ${String(name).toUpperCase()}
- Industry: ${industry}
- Core offerings: ${offerings}
${description ? `- Positioning: ${description}\n` : ""}- Target audience: ${audience}
- Customer pain points: ${painPoints}
- Brand voice: ${voice}`;
}
