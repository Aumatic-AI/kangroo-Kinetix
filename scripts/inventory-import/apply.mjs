#!/usr/bin/env node
// Idempotent upsert of the normalized inventory JSON into Supabase.
//
//   node scripts/inventory-import/apply.mjs --in inventory.normalized.json              (DRY-RUN, default; no network)
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/inventory-import/apply.mjs --in X.json --apply --business-id <uuid> --expect-project-ref <ref>
//
// Writing requires --apply AND --business-id AND --expect-project-ref; the URL/key come from the
// environment only (never read from files). Refuses to write if the URL host is not <ref>.supabase.co.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const die = (m) => {
  console.error("ERROR: " + m);
  process.exit(1);
};

const inPath = opt("in");
if (!inPath) die("--in <normalized.json> is required");
const data = JSON.parse(readFileSync(inPath, "utf8"));
const apply = flag("apply");
const businessId = opt("business-id");
const expectRef = opt("expect-project-ref");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHUNK = 200;
const chunks = (a, n = CHUNK) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

function propertyRow(p, bid) {
  return {
    business_id: bid,
    source_key: p.source_key,
    source_row: p.source_row,
    import_batch: p.import_batch,
    title: p.title,
    space_category: p.space_category,
    event_types: p.event_types,
    event_types_raw: p.event_types_raw,
    location_raw: p.location_raw,
    city: p.city,
    region: p.region,
    country: p.country,
    timezone: p.timezone,
    location_verified: p.location_verified,
    status: p.status,
    legacy_fields: p.legacy_fields,
  };
}

function summary() {
  const c = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
  return {
    properties: data.properties.length,
    location_verified: c(data.properties, (p) => p.location_verified),
    images: data.images.length,
    image_validation_status: c(data.images, (i) => i.validation_status),
    legacy: data.legacy.length,
    legacy_link_status: c(data.legacy, (l) => l.link_status),
    rejected_not_imported: data.rejected.length,
  };
}

if (!apply) {
  console.log("DRY-RUN (nothing written, no network). Plan:");
  console.log(JSON.stringify(summary(), null, 2));
  console.log("Would upsert: properties ON CONFLICT (business_id, source_key); property_images ON CONFLICT (property_id, position); property_legacy_content ON CONFLICT (business_id, source_key).");
  console.log("Rejected rows (kept out, listed in JSON.rejected):");
  for (const r of data.rejected) console.log(`  - ${r.sheet} row ${r.source_row}${r.kind ? " " + r.kind : ""}: ${String(r.reason).slice(0, 120)}`);
  if (businessId || expectRef) console.log("(--business-id/--expect-project-ref ignored without --apply)");
  process.exit(0);
}

// ---- write mode guards
if (!businessId || !UUID.test(businessId)) die("--apply requires a valid --business-id <uuid>");
if (!expectRef) die("--apply requires --expect-project-ref <project-ref>");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) die("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment");
let host;
try {
  host = new URL(url).hostname;
} catch {
  die("NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
}
if (host !== `${expectRef}.supabase.co`) die(`URL host '${host}' does not match --expect-project-ref '${expectRef}'; refusing to write`);

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const check = (label, { error }) => {
  if (error) die(`${label}: ${error.message}`);
};

// 1. properties
for (const part of chunks(data.properties)) {
  check("upsert properties", await sb.from("properties").upsert(part.map((p) => propertyRow(p, businessId)), { onConflict: "business_id,source_key" }));
}
// 2. resolve ids by source_key
const idByKey = new Map();
for (let from = 0; ; from += 1000) {
  const { data: rows, error } = await sb.from("properties").select("id,source_key").eq("business_id", businessId).range(from, from + 999);
  check("select property ids", { error });
  for (const r of rows) idByKey.set(r.source_key, r.id);
  if (rows.length < 1000) break;
}
const missing = data.properties.filter((p) => !idByKey.has(p.source_key));
if (missing.length) die(`${missing.length} properties missing after upsert (first: ${missing[0].source_key})`);

// 3. images
const imgRows = data.images.map((i) => ({
  business_id: businessId,
  property_id: idByKey.get(i.property_source_key),
  position: i.position,
  url: i.url,
  validation_status: i.validation_status,
}));
for (const part of chunks(imgRows)) check("upsert property_images", await sb.from("property_images").upsert(part, { onConflict: "property_id,position" }));

// 4. legacy content (property_id null when unlinked/ambiguous)
const legRows = data.legacy.map((l) => ({
  business_id: businessId,
  property_id: l.property_source_key ? idByKey.get(l.property_source_key) : null,
  property_title_raw: l.property_title_raw,
  kind: l.kind,
  source_sheet: l.source_sheet,
  source_row: l.source_row,
  source_key: l.source_key,
  url: l.url,
  caption: l.caption,
  hashtags: l.hashtags,
  source_status: l.source_status,
  source_created_at: l.source_created_at,
  raw: l.raw,
}));
for (const part of chunks(legRows)) check("upsert property_legacy_content", await sb.from("property_legacy_content").upsert(part, { onConflict: "business_id,source_key" }));

console.log("APPLIED:", JSON.stringify({ ...summary(), business_id: businessId, project_ref: expectRef }, null, 2));
