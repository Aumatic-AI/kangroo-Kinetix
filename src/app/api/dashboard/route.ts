import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/supabase";
import { getFirstBusinessId } from "@/lib/business";
import { env } from "@/config/env";
import { UploadPostService, SUPPORTED_UPLOAD_POST_PLATFORMS, type UploadPostPlatform } from "@/services/upload-post";
import { addDays, nextWeeklyRunMs } from "@/services/content-automation/schedule";
import { DASHBOARD_RANGES, type DashboardData, type DashboardRange } from "@/modules/dashboard/types";
import { buildAttention, OVERDUE_MS, type AttentionFacts, type CountWithLatest } from "@/modules/dashboard/lib/attention";

export const dynamic = "force-dynamic";

const AUTOMATION_PLATFORMS = ["tiktok", "instagram", "facebook", "linkedin"] as const;
const DAY = 86_400_000;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** A fresh response per request — never a shared module-level object (see CLAUDE.md). */
function emptyResponse(range: DashboardRange): DashboardData {
  return {
    range,
    rangeDays: DASHBOARD_RANGES[range].days,
    analytics: {
      available: false,
      kpis: { followers: null, impressions: null, reach: null, engagement: null, connectedAccounts: 0 },
      impressionsTrend: [],
      impressionsByPlatform: [],
      platformComparison: [],
      engagementBreakdown: [],
      platformHealth: SUPPORTED_UPLOAD_POST_PLATFORMS.map((platform) => ({ platform, status: "not_connected" })),
      audienceDemographics: null,
    },
    automation: null,
    automationError: null,
    attention: [],
  };
}

/** The last `days` calendar days (UTC), oldest first. */
function dayRange(days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(new Date(Date.now() - i * DAY).toISOString().slice(0, 10));
  return out;
}

const engagementOf = (m: { likes?: number; comments?: number; shares?: number; saves?: number }) =>
  (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);

type Db = SupabaseClient<Database>;
type Connection = { platform: string; status: string; metadata: unknown };

/** Throws on a query error, so a failed read is reported, never mistaken for "nothing to show". */
function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}
function countOf(res: { count: number | null; error: { message: string } | null }, what: string): number {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.count ?? 0;
}
async function countWithLatest(q: PromiseLike<{ data: { error_message: string | null }[] | null; count: number | null; error: { message: string } | null }>, what: string): Promise<CountWithLatest> {
  const res = await q;
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return { count: res.count ?? 0, latestError: res.data?.[0]?.error_message ?? null };
}

/** Social analytics, live from Upload-Post on every load. Failures are returned, not swallowed. */
async function loadAnalytics(out: DashboardData["analytics"], connections: Connection[], days: string[]): Promise<string[]> {
  const errors: string[] = [];
  const statusByPlatform = new Map(connections.map((c) => [c.platform, c.status]));
  out.platformHealth = SUPPORTED_UPLOAD_POST_PLATFORMS.map((platform) => ({ platform, status: statusByPlatform.get(platform) || "not_connected" }));
  const connected = out.platformHealth.filter((p) => p.status === "connected").map((p) => p.platform as UploadPostPlatform);
  out.kpis.connectedAccounts = connected.length;
  if (!connected.length) return errors;

  const username = env.UPLOAD_POST_PROFILE;
  if (!username) return ["Social analytics can't load: Upload-Post isn't configured (UPLOAD_POST_PROFILE)"];

  const [profileRes, totalsRes] = await Promise.allSettled([
    UploadPostService.getProfileAnalytics(username, connected),
    // Exact range (not a preset): 14 days and 6 months have no preset.
    UploadPostService.getTotalImpressions(username, { startDate: days[0], endDate: days[days.length - 1], breakdown: true }),
  ]);
  if (profileRes.status === "rejected") errors.push(`Couldn't load account analytics from Upload-Post (followers, reach, engagement): ${errText(profileRes.reason)}`);
  if (totalsRes.status === "rejected") errors.push(`Couldn't load impressions from Upload-Post: ${errText(totalsRes.reason)}`);
  const profileAnalytics = profileRes.status === "fulfilled" ? profileRes.value : {};
  const totals = totalsRes.status === "fulfilled" ? totalsRes.value : null;

  let followers = 0, engagement = 0, reach = 0, has = false;
  const parts = { likes: 0, comments: 0, shares: 0, saves: 0 };
  const missing: string[] = [];
  for (const platform of connected) {
    const a = profileAnalytics[platform];
    if (!a) { missing.push(platform); continue; }
    has = true;
    followers += a.followers || 0;
    engagement += engagementOf(a);
    reach += a.reach ?? a.impressions ?? 0;
    parts.likes += a.likes || 0; parts.comments += a.comments || 0; parts.shares += a.shares || 0; parts.saves += a.saves || 0;
    out.platformComparison.push({ platform, followers: a.followers || 0, reach: a.reach ?? a.impressions ?? 0, engagement: engagementOf(a) });
  }
  // Upload-Post answered but left a connected platform out: its numbers are missing from the totals.
  if (profileRes.status === "fulfilled" && missing.length) errors.push(`Upload-Post returned no analytics for ${missing.join(", ")} — the totals leave ${missing.length === 1 ? "it" : "them"} out`);
  if (has) {
    out.kpis.followers = followers;
    out.kpis.engagement = engagement;
    out.kpis.reach = reach;
    out.engagementBreakdown = (["likes", "comments", "shares", "saves"] as const).map((type) => ({ type, value: parts[type] })).filter((e) => e.value > 0);
  }
  const igDemo = profileAnalytics["instagram"]?.follower_demographics;
  if (igDemo?.age && Object.keys(igDemo.age).length && igDemo.gender && Object.keys(igDemo.gender).length) {
    out.audienceDemographics = { age: igDemo.age, gender: igDemo.gender };
  }
  if (totals) {
    out.impressionsTrend = days.map((date) => ({ date, impressions: totals.per_day?.[date] || 0 }));
    out.kpis.impressions = totals.per_day ? out.impressionsTrend.reduce((s, d) => s + d.impressions, 0) : totals.total_impressions ?? null;
    out.impressionsByPlatform = Object.entries(totals.per_platform ?? {})
      .map(([platform, impressions]) => ({ platform, impressions })).sort((a, b) => b.impressions - a.impressions);
  }
  out.available = has || !!totals;
  return errors;
}

type Settings = { automation_mode: string; is_enabled: boolean; auto_run_enabled: boolean; generation_timezone: string; updated_at: string;
  social_image_frequency_per_week: number; social_video_frequency_per_week: number; linkedin_frequency_per_week: number; blog_frequency_per_week: number };

/** Content-automation status for the card — from the database. */
async function loadAutomation(supabase: Db, businessId: string, settings: Settings | null): Promise<DashboardData["automation"]> {
  if (!settings) return null;
  const nowIso = new Date().toISOString();
  const tz = settings.generation_timezone ?? "America/Toronto";
  const [cycleRes, upPostsRes, upBlogsRes, recPostsRes, recBlogsRes] = await Promise.all([
    supabase.from("content_generation_cycles").select("id, week_start, environment").eq("business_id", businessId).order("week_start", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("social_posts").select("id, platform, status, scheduled_at, schedule_timezone, property_content_id")
      .eq("business_id", businessId).not("property_content_id", "is", null).in("status", ["scheduled", "held"]).gte("scheduled_at", nowIso).order("scheduled_at").limit(6),
    supabase.from("blog_publications").select("id, status, scheduled_at, property_content_id")
      .eq("business_id", businessId).in("status", ["pending", "held"]).order("scheduled_at").limit(6),
    supabase.from("social_posts").select("id, platform, published_at, platform_post_id, property_content_id")
      .eq("business_id", businessId).not("property_content_id", "is", null).eq("status", "published").order("published_at", { ascending: false }).limit(5),
    supabase.from("blog_publications").select("id, published_at, wp_url, property_content_id")
      .eq("business_id", businessId).eq("status", "published").order("published_at", { ascending: false }).limit(5),
  ]);
  const cycle = must(cycleRes, "latest cycle");
  const upcomingPosts = must(upPostsRes, "upcoming posts") ?? [];
  const upcomingBlogs = must(upBlogsRes, "upcoming blogs") ?? [];
  const recentPosts = must(recPostsRes, "recent posts") ?? [];
  const recentBlogs = must(recBlogsRes, "recent blogs") ?? [];

  let cycleSummary: NonNullable<DashboardData["automation"]>["cycle"] = null;
  if (cycle) {
    const jobs = must(await supabase.from("content_generation_queue").select("generation_status").eq("cycle_id", cycle.id), "cycle jobs") ?? [];
    const count = (s: string) => jobs.filter((j) => j.generation_status === s).length;
    cycleSummary = { weekStart: cycle.week_start, environment: cycle.environment as "testing" | "live",
      total: jobs.length, completed: count("completed"), failed: count("failed"), inProgress: count("pending") + count("processing") };
  }

  const contentIds = [...new Set([...upcomingPosts, ...upcomingBlogs, ...recentPosts, ...recentBlogs]
    .map((r) => r.property_content_id as string | null).filter((x): x is string => !!x))];
  const titleByContent = new Map<string, string>();
  if (contentIds.length) {
    const pcs = must(await supabase.from("property_content").select("id, property_id").in("id", contentIds), "creatives") ?? [];
    const propIds = [...new Set(pcs.map((p) => p.property_id))];
    const props = propIds.length ? must(await supabase.from("properties").select("id, title").in("id", propIds), "listings") ?? [] : [];
    const titleByProp = new Map(props.map((p) => [p.id, p.title as string]));
    for (const pc of pcs) titleByContent.set(pc.id, titleByProp.get(pc.property_id) ?? "");
  }
  const title = (id: string | null) => (id ? titleByContent.get(id) ?? "" : "");

  return {
    mode: settings.automation_mode as "testing" | "live", isEnabled: settings.is_enabled, autoRunEnabled: settings.auto_run_enabled, timezone: tz,
    nextRunAt: settings.auto_run_enabled && settings.is_enabled ? new Date(nextWeeklyRunMs(Date.now(), "America/Toronto")).toISOString() : null,
    cycle: cycleSummary,
    upcoming: [
      ...upcomingPosts.map((p) => ({ platform: p.platform as string, at: p.scheduled_at as string, timezone: p.schedule_timezone ?? tz, held: p.status === "held", title: title(p.property_content_id), contentId: p.property_content_id as string })),
      ...upcomingBlogs.filter((b) => b.scheduled_at).map((b) => ({ platform: "blog", at: b.scheduled_at as string, timezone: tz, held: b.status === "held", title: title(b.property_content_id), contentId: b.property_content_id })),
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 6),
    recent: [
      ...recentPosts.map((p) => ({ platform: p.platform as string, at: p.published_at as string, url: p.platform_post_id?.startsWith("http") ? p.platform_post_id : null, title: title(p.property_content_id), contentId: p.property_content_id as string })),
      ...recentBlogs.map((b) => ({ platform: "blog", at: b.published_at as string, url: b.wp_url, title: title(b.property_content_id), contentId: b.property_content_id })),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5),
  };
}

/** Every fact the "Needs attention" list is built from. A failed read throws (and is reported). */
async function loadAttentionFacts(supabase: Db, businessId: string, settings: Settings | null):
  Promise<Omit<AttentionFacts, "now" | "loadErrors" | "settings" | "config" | "connections">> {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const auto = () => supabase.from("social_posts").select("error_message", { count: "exact" }).eq("business_id", businessId).not("property_content_id", "is", null);
  const manual = () => supabase.from("social_posts").select("error_message", { count: "exact" }).eq("business_id", businessId).is("property_content_id", null);
  const blogs = () => supabase.from("blog_publications").select("error_message", { count: "exact" }).eq("business_id", businessId);
  const latest = <Q extends { order: (c: string, o: { ascending: boolean }) => Q; limit: (n: number) => Q }>(q: Q) => q.order("updated_at", { ascending: false }).limit(1);

  const [postsFailed, postsSkipped, unconfirmedRes, scheduledRes, blogsFailed, blogsSkipped, blogsOverdueRes, genFailed, stalledRes, liveRes, manualFailed, manualStuckRes, manualSchedRes] = await Promise.all([
    countWithLatest(latest(auto().eq("status", "failed").eq("publish_outcome_unknown", false)), "failed posts"),
    countWithLatest(latest(auto().eq("status", "skipped").gte("updated_at", iso(now - 7 * DAY))), "skipped posts"),
    auto().eq("status", "publishing").eq("publish_outcome_unknown", true).limit(1),
    supabase.from("social_posts").select("platform, scheduled_at, connection_id").eq("business_id", businessId).not("property_content_id", "is", null).eq("status", "scheduled").limit(500),
    countWithLatest(latest(blogs().eq("status", "failed")), "failed blogs"),
    countWithLatest(latest(blogs().eq("status", "skipped").gte("updated_at", iso(now - 7 * DAY))), "skipped blogs"),
    blogs().eq("status", "pending").lt("next_attempt_at", iso(now - OVERDUE_MS)).limit(1),
    countWithLatest(supabase.from("content_generation_queue").select("error_message", { count: "exact" }).eq("business_id", businessId)
      .eq("generation_status", "failed").gte("created_at", iso(now - 7 * DAY)).order("created_at", { ascending: false }).limit(1), "failed generation"),
    settings?.is_enabled
      ? supabase.from("content_generation_queue").select("id, generation_status, next_attempt_at, locked_until, content_generation_cycles!inner(environment)")
          .eq("business_id", businessId).eq("content_generation_cycles.environment", settings.automation_mode).in("generation_status", ["pending", "processing"]).limit(200)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("property_content").select("id, pipeline_type, social_posts(id)").eq("business_id", businessId).eq("environment", "live")
      .in("pipeline_type", ["social", "linkedin"]).eq("generation_status", "completed").is("archived_at", null).not("current_revision_id", "is", null)
      .gte("created_at", iso(now - 8 * DAY)).limit(200),
    countWithLatest(latest(manual().eq("status", "failed")), "failed Social posts"),
    manual().eq("status", "publishing").lt("updated_at", iso(now - 15 * 60_000)).limit(1),
    manual().eq("status", "scheduled").lt("scheduled_at", iso(now - 15 * 60_000)).limit(1),
  ]);

  // Connection status per platform_connections row, for "this scheduled post can't publish".
  const { data: connRows, error: connErr } = await supabase.from("platform_connections").select("id, status").eq("business_id", businessId);
  if (connErr) throw new Error(`connections: ${connErr.message}`);
  const connStatus = new Map((connRows ?? []).map((c) => [c.id, c.status as string]));
  const scheduled = (must(scheduledRes, "scheduled posts") ?? []).map((p) => ({
    platform: p.platform as string, scheduledAt: p.scheduled_at as string, connectionStatus: p.connection_id ? connStatus.get(p.connection_id) ?? null : null,
  }));

  const stalled = ((must(stalledRes as { data: { generation_status: string; next_attempt_at: string; locked_until: string | null }[] | null; error: { message: string } | null }, "generation queue") ?? []))
    .filter((j) => (j.generation_status === "pending" && Date.parse(j.next_attempt_at) < now - 60 * 60_000)
      || (j.generation_status === "processing" && j.locked_until !== null && Date.parse(j.locked_until) < now - 30 * 60_000)).length;

  const creativesMissingPosts = ((must(liveRes, "live creatives") ?? []) as { pipeline_type: string; social_posts: { id: string }[] }[])
    .filter((c) => (c.social_posts?.length ?? 0) < (c.pipeline_type === "linkedin" ? 1 : 3)).length;

  // The last weekly run should have created next week's cycle (only checked when it was clearly expected:
  // weekly runs on, frequencies set, and settings unchanged since before that run).
  let missedWeeklyRun: string | null = null;
  if (settings?.auto_run_enabled && settings.is_enabled) {
    const total = settings.social_image_frequency_per_week + settings.social_video_frequency_per_week + settings.linkedin_frequency_per_week + settings.blog_frequency_per_week;
    const prevRun = nextWeeklyRunMs(now - 7 * DAY, "America/Toronto");
    if (total > 0 && prevRun < now - 30 * 60_000 && Date.parse(settings.updated_at) < prevRun) {
      const runDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(prevRun));
      const { data: cyc, error } = await supabase.from("content_generation_cycles").select("id")
        .eq("business_id", businessId).eq("environment", settings.automation_mode).eq("week_start", addDays(runDay, 3)).limit(1);
      if (error) throw new Error(`weekly cycle: ${error.message}`);
      if (!cyc?.length) missedWeeklyRun = new Date(prevRun).toISOString();
    }
  }

  return {
    automationPosts: { failed: postsFailed, unconfirmed: countOf(unconfirmedRes, "unconfirmed posts"), skippedRecently: postsSkipped, scheduled },
    blogs: { failed: blogsFailed, skippedRecently: blogsSkipped, overdue: countOf(blogsOverdueRes, "overdue blogs") },
    generation: { failedRecently: genFailed, stalled },
    creativesMissingPosts,
    manualPosts: {
      failed: manualFailed,
      stuckPublishing: countOf(manualStuckRes, "stuck Social posts"),
      unconfirmedScheduled: countOf(manualSchedRes, "unconfirmed Social posts"),
    },
    missedWeeklyRun,
  };
}

const EMPTY_FACTS: Omit<AttentionFacts, "now" | "loadErrors" | "settings" | "config" | "connections"> = {
  automationPosts: { failed: { count: 0, latestError: null }, unconfirmed: 0, skippedRecently: { count: 0, latestError: null }, scheduled: [] },
  blogs: { failed: { count: 0, latestError: null }, skippedRecently: { count: 0, latestError: null }, overdue: 0 },
  generation: { failedRecently: { count: 0, latestError: null }, stalled: 0 },
  creativesMissingPosts: 0,
  manualPosts: { failed: { count: 0, latestError: null }, stuckPublishing: 0, unconfirmedScheduled: 0 },
  missedWeeklyRun: null,
};

/**
 * The Dashboard's one call: social analytics (live from Upload-Post), the
 * content-automation status (database), and "Needs attention" — every failure or
 * stuck state across publishing, generation, accounts and configuration, including
 * this route's own failures to load data. Nothing that goes wrong here is only logged.
 * `?range=` (7d/14d/30d/90d/180d, default 30d) scopes impressions.
 */
export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("range");
  const range: DashboardRange = param && Object.hasOwn(DASHBOARD_RANGES, param) ? (param as DashboardRange) : "30d";
  try {
    const supabase = (await createClient()) as Db;
    const body = emptyResponse(range);
    const businessId = await getFirstBusinessId(supabase);
    if (!businessId) return NextResponse.json(body);

    const [settingsRes, connRes] = await Promise.all([
      supabase.from("content_automation_settings")
        .select("automation_mode, is_enabled, auto_run_enabled, generation_timezone, updated_at, social_image_frequency_per_week, social_video_frequency_per_week, linkedin_frequency_per_week, blog_frequency_per_week")
        .eq("business_id", businessId).maybeSingle(),
      supabase.from("platform_connections").select("platform, status, metadata").eq("business_id", businessId).eq("account_kind", "upload_post"),
    ]);
    const loadErrors: string[] = [];
    if (settingsRes.error) loadErrors.push(`Couldn't load automation settings: ${settingsRes.error.message}`);
    if (connRes.error) loadErrors.push(`Couldn't load connected accounts: ${connRes.error.message}`);
    const settings = (settingsRes.data ?? null) as Settings | null;
    const connections = (connRes.data ?? []) as Connection[];

    const [analyticsErrors, automation, facts] = await Promise.all([
      loadAnalytics(body.analytics, connections, dayRange(body.rangeDays)).catch((e) => [`Couldn't load social analytics: ${errText(e)}`]),
      loadAutomation(supabase, businessId, settings).then((a) => ({ ok: true as const, a }), (e) => ({ ok: false as const, error: errText(e) })),
      loadAttentionFacts(supabase, businessId, settings).then((f) => ({ ok: true as const, f }), (e) => ({ ok: false as const, error: errText(e) })),
    ]);
    loadErrors.push(...analyticsErrors);
    if (automation.ok) body.automation = automation.a;
    else { body.automationError = automation.error; loadErrors.push(`Couldn't load the automation status: ${automation.error}`); }
    if (!facts.ok) loadErrors.push(`Couldn't check publishing for problems — some failures may not be listed: ${facts.error}`);

    body.attention = buildAttention({
      now: Date.now(),
      loadErrors,
      settings: settings ? {
        mode: settings.automation_mode as "testing" | "live", isEnabled: settings.is_enabled, autoRunEnabled: settings.auto_run_enabled,
        blogFrequency: settings.blog_frequency_per_week,
        totalFrequency: settings.social_image_frequency_per_week + settings.social_video_frequency_per_week + settings.linkedin_frequency_per_week + settings.blog_frequency_per_week,
      } : null,
      config: { uploadPostProfile: !!env.UPLOAD_POST_PROFILE, wordpress: !!(env.WORDPRESS_URL && env.WORDPRESS_USERNAME && env.WORDPRESS_APP_PASSWORD) },
      connections: connections.filter((c) => (AUTOMATION_PLATFORMS as readonly string[]).includes(c.platform)).map((c) => ({
        platform: c.platform, status: c.status,
        hasPage: !!(c.metadata as Record<string, unknown> | null)?.[c.platform === "facebook" ? "facebookPageId" : c.platform === "linkedin" ? "linkedinPageId" : ""],
      })),
      ...(facts.ok ? facts.f : EMPTY_FACTS),
    });
    return NextResponse.json(body);
  } catch (error: unknown) {
    console.error("[DASHBOARD]", error);
    return NextResponse.json({ error: errText(error) || "Failed to load dashboard" }, { status: 500 });
  }
}
