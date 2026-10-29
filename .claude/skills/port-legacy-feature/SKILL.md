---
description: Port a feature from the legacy n8n/Next.js project (under projects/) into Kinetix's clean architecture. Use whenever building something that already exists in the old project — Meta Ads campaign features, social publishing, outreach workflows, etc.
---

# Porting a legacy feature into Kinetix

The legacy project's code quality is poor, but its actual behavior — the feature logic, the API call sequences, the business rules baked into prompts and flows — is proven in production. The job is to port the *behavior*, not the *code*.

1. **Read the real legacy implementation in full** before writing anything new — every relevant route/component under `projects/`, not a summary of it. Don't guess at what a legacy route does from its filename.
2. **Port the proven logic verbatim**: business rules, API call sequences, prompt content, validation order, edge-case handling. Don't invent a "better" approach to something that already works, even if the legacy code style is bad.
3. **Rewrite only the implementation quality**, not the behavior:
   - Replace copy-pasted fetch/error-handling boilerplate with the shared helper for that domain (e.g. `src/services/meta/graph-client.ts`).
   - Replace N+1 sequential API calls with a single nested/field-expansion query where the legacy code already proved that pattern works elsewhere in the same project.
   - Fit the new `businesses`/`business_users` schema and existing service-class/hook conventions instead of the legacy project's ad-hoc table names.
   - Remove hardcoded business-specific values (URLs, names) in favor of reading them from the `businesses` row.
4. **Call out every simplification explicitly** rather than silently dropping legacy behavior — if a v1 port skips something the legacy version did (e.g. narrower targeting options, no CBO toggle), say so plainly instead of letting it look like full parity.
5. **Don't silently change safety defaults** without flagging it — e.g. if the legacy version auto-activated something and the new port defaults to paused/off for safety, say that's a deliberate change, not an oversight.
