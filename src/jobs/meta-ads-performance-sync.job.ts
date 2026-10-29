import { inngest } from "@/services/inngest/client";
import { MetaAdsInsightsService } from "@/modules/meta-ads/services/insights.service";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/config";

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY!
);

// Daily sync of each business's own Meta ad performance into
// ad_performance_daily — the input to the self-ad ("business ad")
// analysis job. This is "Performance Polling" from modules/meta_ads.md,
// previously undocumented as unbuilt — first real implementation.
export const metaAdsPerformanceSyncJob = inngest.createFunction(
  { id: "jobs-meta-ads-performance-sync", triggers: [{ cron: "0 4 * * *" }] }, // daily, 4 AM UTC
  async ({ step }: any) => {
    const businesses = await step.run("fetch-businesses", async () => {
      const { data } = await supabase.from("businesses").select("*");
      return data || [];
    });

    for (const business of businesses) {
      await step.run(`sync-ads-${business.id}`, async () => {
        // Single-tenant: one Meta System User token + ad account id, set
        // once as env vars — same as the legacy project, no per-business
        // OAuth connection to look up.
        const accessToken = env.META_ACCESS_TOKEN;
        const adAccountId = env.META_AD_ACCOUNT_ID;

        if (!accessToken || !adAccountId) {
          console.log(`META_ACCESS_TOKEN/META_AD_ACCOUNT_ID not configured — skipping business ${business.id}.`);
          return;
        }

        let ads;
        try {
          ads = await MetaAdsInsightsService.fetchAdsWithInsights(accessToken, adAccountId, "yesterday");
        } catch (e) {
          console.error(`Meta Insights fetch failed for business ${business.id}:`, e);
          return;
        }

        if (!ads.length) return;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const metricDate = yesterday.toISOString().split("T")[0];

        const rows = ads.map((ad) => ({
          business_id: business.id,
          meta_ad_id: ad.metaAdId,
          metric_date: metricDate,
          spend_cents: ad.spendCents,
          impressions: ad.impressions,
          clicks: ad.clicks,
          reach: ad.reach,
          ctr: ad.ctr,
          cpc_cents: ad.cpcCents,
          cpm_cents: ad.cpmCents,
          conversions: ad.conversions,
          cpa: ad.conversions > 0 ? Number((ad.spendCents / 100 / ad.conversions).toFixed(2)) : null,
          ad_text: [ad.headline, ad.body].filter(Boolean).join(" — ") || null,
          media_url: ad.imageUrl || null,
          format: ad.imageUrl ? "image" : null,
        }));

        const { error } = await supabase
          .from("ad_performance_daily")
          .upsert(rows, { onConflict: "meta_ad_id,metric_date" });

        if (error) console.error(`Failed to upsert ad_performance_daily for business ${business.id}:`, error.message);
      });
    }
  }
);
