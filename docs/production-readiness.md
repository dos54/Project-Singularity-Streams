# Production readiness — 2026-09-19

Status: local fixes validated; production has not been deployed or rerouted.

## Follow-up: promote code, retain history

User confirmed Twitch livestreams work after the staging fix. Read-only D1 checks
found 1,213 production video rows (1,213 unique IDs) versus 603 staging rows (603
unique IDs). Production includes one live status; staging has only ordinary videos.
The fallback bootstrap fetches just the newest 50 playlist items per creator, without
walking the historical playlist. Rebuilding from empty does not restore all archived
production videos. Prefer deploying the tested code with production bindings and
applying pending migrations; do not replace production data with staging data.

Discord invites already exist for Ducked, Neurotic Goose and Sol IX in both databases.
The member list now displays normalized Discord links and wraps its social buttons.

Automatic deployment is a separate concern from production mode. The local GitHub
workflow runs checks only; it does not deploy the Worker or publish the frontend.
The package's manual publish command pushes compiled files to gh-pages. A future
deployment workflow should run checks first, then deploy only from main (never PRs),
using scoped Cloudflare credentials in GitHub secrets and an explicit production
API URL. Keep the first migration/cutover manual; enable recurring deployment only
after the final Worker/domain/database choices are settled.

## Confirmed Twitch failure

Cloudflare staging binding metadata has no `TWITCH_CLIENT_SECRET`. The production
`twitch-proxy` Worker has that secret. Secret values were not retrieved. Staging
observability reports upstream `http-403` during the reported failure window.

The router also returned promises without awaiting them inside its try/catch.
Rejected upstream requests therefore escaped as Cloudflare 1101 pages. This is now
fixed for all public controllers. Missing Twitch credentials fail before an upstream
request, with a sanitized diagnostic; clients receive controlled JSON and CORS.

Next staging commands (the first prompts privately for the existing Twitch app secret):

```powershell
npx wrangler secret put TWITCH_CLIENT_SECRET --config worker/wrangler.staging.jsonc
npx wrangler deploy --config worker/wrangler.staging.jsonc
```

Check `/twitch/livestreams` returns HTTP 200 and JSON from the browser. A list with
all `isLive: false` is valid only if no configured creators are live. If it fails,
inspect the new `public-read` log reason; do not assume the missing-secret fix proves
the credential itself is valid. Never put secrets in frontend VITE variables.

## Fixes in this review

- Await public handlers so asynchronous failures are handled; sanitize failure logs.
- Validate Twitch credentials before token requests; regression tests assert JSON,
  CORS and zero upstream work for missing credentials, plus upstream rejection cases.
- Show filtered/total active creator counts. Dual-platform creators count once.
  Mark the count partial when either provider or member data failed.
- Show the throttle countdown during initial refresh as well as archive loading.
- Correct the `stale-while-revalidate` cache-header spelling.
- CI now runs frontend tests and a frontend build alongside the backend suite.

## Cutover plan: retain the existing production database

1. Finish the staging Twitch check above. Check current upload results, cache restore,
   pagination, filter preferences, and a real live stream when available. Local mocks
   validate UI logic; they cannot prove live upstream behavior.
2. Record the currently deployed production Worker version and GitHub Pages commit
   for rollback. Export production D1 to a private backup before applying migrations.
   Inspect its migration ledger and schema: apply only pending migrations with the
   production config; do not rerun initial member seed SQL manually.
3. Correct `worker/wrangler.jsonc` before deploying: enable `YOUTUBE_PUSH_ENABLED`
   and `YOUTUBE_FALLBACK_ENABLED`, set the final production callback URL, retain
   production D1/KV bindings and the cost guards. Add `YOUTUBE_WEBHOOK_SECRET` to
   production privately. Existing production Twitch/YouTube secrets must remain.
   The old `env.dev` block points at production D1/KV: do not use it for staging.
4. `api.singularitystream.org` currently routes to **singularity-streams-staging**.
   Move staging to a separate staging hostname and update its callback first, or
   explicitly retire staging at cutover. Update local staging config so a later
   staging deploy cannot reclaim the production hostname. Allow WebSub subscriptions
   to renew after callback changes; the API fallback covers the transition.
5. Deploy production against its migrated database, validate on its existing hostname,
   then move `api.singularitystream.org` to `twitch-proxy` and verify it again. Keep
   the old production workers.dev endpoint during the old frontend transition.
   Remove temporary diagnostic settings from the promoted configuration.
6. Build the frontend with an explicit public production API URL. `.env.staging` is
   ignored and must not be assumed to exist in CI. Verify the built artifact uses the
   production host, includes the GitHub Pages SPA `404.html`, and has no dev fixtures.
   The current `build-and-publish` script force-pushes gh-pages: do not use it as a
   review/build command. Publish the reviewed artifact separately.
7. After frontend verification, disable alternate workers.dev/preview access if using
   custom-domain perimeter protection. Validate origin, webhook and cron requests.
   Watch errors, CPU, D1 reads/writes, inbox backlog and upstream quota through a full
   refresh cycle. Keep staging cron usage in account-wide totals.

Rollback: restore the prior frontend artifact and Worker version, and revert API
hostname ownership if necessary. Keep the additive database migrations and data;
do not drop new tables to roll back application code. Pause the new cron if it is
causing problems. Confirm the old frontend's backend hostname still works first.

## Remaining limitations

- No hard $5 billing cap. Cache/rate/CPU controls bound some work but do not prevent
  billable incoming requests. Hostname WAF/usage alert configuration remains separate.
- Older browser-cached descriptions and deleted videos can remain stale; newest 100
  refresh on return. IndexedDB can be cleared or evicted by the browser. Full archive
  loading can still hit the shared cache-miss guard on cold history.
- The 250 ms CPU limit and live scheduling need hosted observation after bootstrap.
  The initial write/read spike is consistent with seeding and cache warm-up, but
  aggregate usage alone does not prove the rollout is safe.
- Frontend build still reports a >500 kB JavaScript chunk; this is a performance
  follow-up, not a deployment failure. Hero/image optimization remains optional.

Do not declare production ready until the credential fix and the topology/configuration
steps have been verified. No credentials or infrastructure ownership changed in this review.
