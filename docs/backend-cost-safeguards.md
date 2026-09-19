# Backend cost safeguards — 2026-09-19

Decision: retain Workers Paid ($5 base) for headroom, aim for Free-level usage, prefer temporary unavailability over unbounded downstream work. No account subscription was changed. These local changes require deployment.

## Billing boundary

Cloudflare documents CPU limits per invocation, not a configurable account-wide $5 stop. Paid requests and database overages remain billable. A 404/503, native rate limiter, or cached response returned inside a Worker still consumes a Worker invocation. Native rate limits are approximate, local to each Cloudflare location, and not billing counters. Do not advertise a hard spending cap.

Official sources checked:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

Reported previous monthly usage versus Paid inclusions: 22,910 invocations vs 10 million requests; 11 million D1 rows read vs 25 billion; 9,000 rows written vs 50 million. If 91 ms is indeed mean CPU per invocation, the corresponding total is approximately 2.08 million ms vs 30 million included. These are partial historic metrics, not a forecast or account-wide bill. D1 query count is not its billed rows-read metric; external subrequest count is not billed as inbound Worker requests. Logs, KV, storage, other Workers, and staging also matter.

## Implemented locally

- CPU ceiling 250 ms per invocation in production and staging configs. This must be measured under hosted bootstrap and steady load; local tests do not enforce Cloudflare billing or validate that ceiling. Native limit failures can temporarily interrupt processing; durable jobs retry later.
- `COST_GUARDS_ENABLED=true` enables native guards. Missing or failing limiter bindings fail closed with 503 and Retry-After 60.
- Public cache misses: at most approximately six per minute per exact endpoint per Cloudflare location. Cache hits remain available. This bounds controller/database/API work under cache stampedes, not inbound requests.
- Webhooks: approximately 120 per minute per Cloudflare location, shared across callback IDs. Diagnostic requests have a separate key. Overload returns 503 so legitimate hub deliveries can retry.
- Only exact anonymous read endpoints are accepted. Unknown path suffixes return 404; unsupported methods return 405 before reads. Queries, cookies, and Authorization cannot fragment/bypass these public snapshot caches. This normalization must NOT be reused for future personalized/authenticated routes.
- Members retain their intended one-hour cache; video/Twitch snapshots remain 30 seconds. HEAD uses the GET cache but returns no body. Cache-hit log spam removed.
- Fallback discovery uses one `json_each` insertion statement per playlist rather than up to 50 separate statements; duplicate inbox entries remain ignored.
- `SERVICE_DISABLED=true` is a manual emergency switch: immediately returns 404 before storage/cache/webhook processing and skips future scheduled work. It is not automatic, does not cancel already-running invocations, and does not stop inbound request billing. Set it in Wrangler vars and redeploy (or dashboard vars and deploy); remove/set false to restore. Do not confuse it with a dollar budget.

Staging deployment after migrations through 0007 have already been applied:

```powershell
npx wrangler deploy --config worker/wrangler.staging.jsonc
```

No new secrets or migrations for these guards. Installed Wrangler 4.56 dry-run validates the binding/configuration syntax. Automated backend suite: 100 passing tests. No hosted settings or production deployment changed by this work.

## Audit findings and remaining work

Public staging returned 100 ordinary videos. A read-only D1 snapshot showed 200 processed video status rows, 403 pending inbox rows, and zero upcoming rows. This confirms ingestion but cannot validate real upcoming/live discovery. Initial queue drains at 50 videos per tick; omitted/unavailable IDs can remain pending with backoff. Do not promise every upcoming stream appears in the uploads playlist.

Twitch tokens are cached within an isolate; cache protection now reduces repeated upstream reads, but tokens are not shared across cold starts. Broader token refresh/retry improvements remain separate work.

The videos query joins status then sorts live-first across the video table; LIMIT 100 alone does not bound scanned rows. A future index/query redesign or precomputed snapshot can reduce reads as history grows. Current work does not claim the entire backend fits Free: bootstrap/enrichment can exceed Free's 50 D1-query limit and CPU allowance.

Before production: measure hosted CPU/error rates under the 250 ms limit, ensure ordinary clients do not see limiter errors, observe backlog drain, compare a known upcoming/live creator to API results, and measure account-wide usage over a day. Configure perimeter protection on the actual production hostname; a custom-domain WAF rule does not protect an alternate enabled workers.dev URL. Account usage alerts/automated route removal are NOT configured here. Neither asynchronous alerts nor sampled usage provide a guaranteed dollar ceiling.

## Follow-up: Twitch and read-query improvements

Local follow-up now passes 107 backend tests. Twitch requests have ten-second timeouts, validated response shapes, one app-token replacement after a 401, and no retry loop for 429/5xx. Empty Twitch rosters make no upstream requests. Token reuse is scoped to matching client credentials and remains per isolate (no new persistent token storage).

The default video list now merges the 100 newest video IDs with up to 100 live IDs before its final sort. Existing date and state indexes are used. A 2,000-video test verifies identical live-first results against a full-history baseline, including old live videos and missing status rows, with fewer D1 rows read. Filtered internal queries retain their original path. No new migration is needed.

A later staging snapshot showed 350 processed ordinary videos and 253 pending jobs with no recorded job error: the initial backlog is progressing. No real upcoming/live discovery has been confirmed.

Production topology confirmed by user: singularitystream.org and singularitystream.net serve the frontend through GitHub Pages; API currently uses its default workers.dev address. Custom API-domain migration is deferred. Proposed future topology: api.singularitystream.org on a Cloudflare Worker custom domain, then appropriate hostname-scoped WAF rules, frontend API URL update, verification, and disabling the old workers.dev/preview entry points. Frontend hosting can remain on GitHub Pages. DNS and perimeter rules were not changed.
