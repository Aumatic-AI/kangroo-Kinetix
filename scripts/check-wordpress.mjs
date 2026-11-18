// Read-only check of the WordPress credentials used for blog publishing. Creates nothing.
// Usage: node --env-file=.env.local scripts/check-wordpress.mjs
const url = process.env.WORDPRESS_URL?.replace(/\/+$/, "");
const user = process.env.WORDPRESS_USERNAME;
const pass = process.env.WORDPRESS_APP_PASSWORD?.replace(/\s+/g, "");
if (!url || !user || !pass) {
  console.error("Missing WORDPRESS_URL, WORDPRESS_USERNAME or WORDPRESS_APP_PASSWORD");
  process.exit(1);
}
const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
const res = await fetch(`${url}/wp-json/wp/v2/users/me?context=edit`, { headers: { Authorization: auth } });
const data = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`FAILED (${res.status}): ${data.code ?? ""} ${data.message ?? res.statusText}`);
  process.exit(1);
}
const caps = data.capabilities ?? {};
console.log(`Signed in as "${data.name}" (id ${data.id}), roles: ${(data.roles ?? []).join(", ") || "?"}`);
for (const c of ["publish_posts", "upload_files", "manage_categories"]) console.log(`  ${c}: ${caps[c] ? "yes" : "NO"}`);
const cat = process.env.WORDPRESS_CATEGORY_ID;
if (cat) {
  const r = await fetch(`${url}/wp-json/wp/v2/categories/${cat}`, { headers: { Authorization: auth } });
  const c = await r.json().catch(() => ({}));
  console.log(r.ok ? `  category ${cat}: "${c.name}"` : `  category ${cat}: NOT FOUND`);
}
process.exit(caps.publish_posts && caps.upload_files ? 0 : 1);
