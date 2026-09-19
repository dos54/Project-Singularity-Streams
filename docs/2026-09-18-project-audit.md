# Project Singularity Streams audit — 2026-09-18

This review covers the checked-out application, reachable local Git history, the user's reported monthly usage, current vendor documentation, and local checks. No production API keys, databases, deployments, billing settings, or Git history were changed. All Worker integration requests used synthetic upstream responses and isolated local D1/KV bindings.

**Main conclusions**

The reported usage is well inside the Workers Paid included allowances, assuming no material additional account usage or storage/logging charges. Free-tier suitability is a separate question: per-invocation CPU and database limits need validation. Most current database work is repeated inspection of unchanged YouTube feed entries. Preserve the existing Vue/Pinia/Worker/D1 architecture, but separate video discovery, live-status refresh, and serving cached results.

**Security findings**

Follow-up: the user confirms the historically exposed Google/YouTube key was replaced. Treat that credential incident as user-confirmed resolved; the recommendations about logging and future secret prevention remain applicable.

- A recognizable Google API key was hardcoded in `worker/src/services/youtubeService.ts:140` in commit `3e607df` (2025-12-22). It was removed in `a954456`, but remains recoverable from history. No attempt was made to test whether it still works. Confirm it has been revoked; otherwise replace it, update the deployed Worker secret, and revoke the old key. Removing a key from HEAD does not invalidate it. [GitHub guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
- Correction to the initial scan: commit `5569455` contains values under `TWITCH_CLIENT_SECRET` and `YOUTUBE_API_KEY`, but both equal the current public Twitch client ID. Those assignments are not confirmed secret leaks. They should not be confused with the separately identified Google key.
- Pattern scanning covered all 368 reachable Git blobs across 110 commits, including tracked build artifacts and local runtime state. The clone is not shallow and contains main and gh-pages refs. The identified Google key was not found in current tracked files. This is not proof that every possible secret pattern, GitHub pull-request ref, fork, log, or deployed configuration is safe.
- `worker/src/services/youtubeService.ts:145` logs the complete failed API URL, including its `key` parameter. Replace that with structured status/error logging without credentials. Review retention of existing logs after rotation.
- There are 172 tracked files under `worker/.wrangler`, including cached blobs and a local KV SQLite database. Their inspected key names concern video caches; no additional credential was identified. Remove runtime state from Git tracking while retaining local files as needed. Ignore rules already match this directory but do not untrack existing files.
- `.dev.vars` is not ignored. Add explicit ignores for local secrets and environment variants, with a safe example file. The tracked `.env.production` contains only the public frontend API base URL. Twitch client IDs, D1/KV identifiers, and the frontend API URL are not authentication secrets.
- Production and development configurations reference the same D1/KV IDs. Local simulation is isolated, but a remote development/deployment mistake could target production resources. Give remote development its own bindings.
- `npm audit` reported 31 affected dependency entries: 3 critical, 19 high, 5 moderate, 4 low. These are package/advisory classifications, not 31 proven exploitable application bugs. Direct affected packages include fast-xml-parser 5.3.1, Vite 7.2.2, Vitest 3.2.4, and Wrangler 4.56.0. Prioritize the parser because it executes in the Worker; upgrade tooling as well. Review each advisory against actual use, then update and retest rather than blindly applying a forced upgrade. [Parser maintainer advisory](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-m7jm-9gc2-mpf2).

**Cost baseline**

Calculations assume a 30-day month. The CPU calculation is valid only if 91 ms is the arithmetic mean over those same 22,910 invocations; a percentile cannot be multiplied this way.

| Metric | Reported / derived usage | Paid included allowance | Free allowance |
| --- | ---: | ---: | ---: |
| Worker invocations | 22,910/month; ~764/day | 10 million/month | 100,000/day |
| Worker CPU | Conditionally 2,084,810 ms/month | 30 million ms/month | 10 ms/invocation |
| D1 rows read | 11 million/month; ~366,667/day | 25 billion/month | 5 million/day |
| D1 rows written | 9,000/month; ~300/day | 50 million/month | 100,000/day |

Cloudflare bills D1 by rows read/written and storage, not by a separate monthly SQL-query count. Workers external subrequests are not billed as additional Worker requests, and network waiting is not CPU time. Thus 4 million SQL queries and ~329,000 subrequests do not themselves imply an overage. The estimated CPU consumption is 6.95% of the paid allowance. These allowances are account-wide; daily peaks, storage, other Workers, and other products are not established here. The $5 plan is a minimum subscription, not a $5 spending cap. Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

Free D1 also has a 500 MB per-database limit and documents 50 queries per Worker invocation versus 1,000 on Paid. Verify batch behavior and per-invocation limits in a representative Free staging environment before a downgrade; local simulation does not establish plan compliance. Reducing job frequency alone does not reduce CPU work per invocation. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

**Where the work comes from**

The cron schedule runs every two minutes: 720 times/day, or 21,600 times/30 days. With 15 members it attempts 324,000 feed requests/month before retries or membership changes. This explains most of the reported invocation/subrequest volume even with few visitors.

The sync routine attempts one upsert per video on every run. Its conditional conflict clause correctly avoids unchanged writes, but the SQL statement still executes and reads data. With 180 feed entries, it also runs 12 status lookup queries because IDs are chunked in groups of 16.

A local integration check used all 15 seeded members and 12 synthetic entries per channel:

| Sync case | SQL statements executed | D1 rows read | D1 rows written | Feed requests | YouTube API requests |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial import | 553 | 1,095 | 1,440 | 15 | 4 |
| Unchanged repeat | 193 | 555 | 0 | 15 | 0 |

The unchanged case projects to **4,168,800 statements and 11,988,000 rows read/month**, close to the reported 4 million / 11 million. This supports the explanation, but is a synthetic reproduction rather than a measurement of production. Index maintenance contributes to the initial write count.

The provided host totals do not exactly reconcile with the headline subrequest count. Treat them as approximate. YouTube feed requests include roughly 44,000 4xx/5xx responses; the status classes alone do not establish whether the cause is throttling, missing channels, or upstream failures. The current `allSettled` handling can log failed feeds while the overall invocation succeeds, explaining why a low Worker-error count does not mean healthy upstream ingestion.

The ~6,000 monthly `videos.list` calls imply about 200 quota units/day if they are all that method. It costs one unit per call. This is modest compared with the default 10,000 daily units for the relevant shared quota pool, but the actual Google project quota and other consumers are unknown. [videos.list](https://developers.google.com/youtube/v3/docs/videos/list), [YouTube quota overview](https://developers.google.com/youtube/v3/getting-started).

**Recommended refresh and data flow**

Retain a single Worker initially. Give its internal jobs distinct responsibilities:

1. Discover new/changed video metadata on a slower per-channel schedule, initially every 10 minutes. Persist a feed validator or content fingerprint and last-success timestamp. Use conditional requests only if the feed endpoint supports useful validators; a 304 still counts as a request. Skip parsing/upserts where possible, and write only changed records.
2. Query D1 for live/upcoming/unknown records whose `nextCheckAt` is due. Refresh these separately in YouTube API batches of at most 50, initially every two minutes for live or imminent streams. Do not depend on the record still appearing in a channel's latest feed.
3. Store normalized video data and explicit states: unknown, upcoming, live, ended, regular video, and unavailable if needed. Preserve scheduled start time, successful check time, next check time, and failure information. Give `actualEndTime` precedence; missing viewer counts/chat IDs are not proof a stream ended. Recheck uncertain/recent entries with bounded backoff.
4. Serve explicit queries for current live streams and latest uploads. Apply the Project Singularity filter before limiting results. The current single newest-100 response can omit older active streams and relevant uploads before the client filters it.
5. Keep Pinia as the frontend state owner. Use a shared API contract, per-resource loading/error/freshness state, and retain last-good data when one provider fails. Poll visible pages every 60–120 seconds with backoff; pause hidden tabs and deduplicate in-flight refreshes. A browser refresh should read cached backend data, not force all upstream services to refresh.

The desired flow is `scheduled discovery/status checks -> D1 -> cached read API -> Pinia -> Vue components`. Twitch can initially keep its current low-volume on-demand fetch with a bounded cached snapshot. At 310 calls/month, rebuilding Twitch around webhooks is lower priority than YouTube ingestion. Token and API counts being equal suggest the isolate-local token cache often does not survive until the next request; this is inexpensive at current traffic.

| Feed interval | Feed requests / 30 days for 15 channels | Reduction from current |
| --- | ---: | ---: |
| 2 minutes | 324,000 | — |
| 5 minutes | 129,600 | 60% |
| 10 minutes | 64,800 | 80% |
| 15 minutes | 43,200 | 86.7% |

Slower discovery delays detection of previously unknown videos/streams by up to that interval, plus processing and client/cache delay. It need not slow checks for known live streams. If quicker discovery becomes important, consider YouTube push notifications with periodic reconciliation. Documented notifications cover uploads and title/description changes; they do not eliminate live-status checks. Subscription verification, renewal, and failure recovery add complexity. [YouTube push notifications](https://developers.google.com/youtube/v3/guides/push_notifications).

Add per-channel timeouts, bounded retries, exponential backoff with jitter, and last-good snapshots. Record status codes and affected channels without credential-bearing URLs. Avoid treating transient API failures as offline status. Set a bounded number of items and upstream batches per run and monitor quota/CPU budgets.

Fix cache policy centrally: members can use a longer TTL than live results. The current middleware overwrites every cacheable endpoint with 30 seconds, misspells `stale-while-revalidate`, and allows unused query strings to create distinct cache entries. For public read-only routes, canonicalize allowed query parameters and enforce methods. Merely correcting the header does not implement stale serving: Cache API `put`/`match` do not support stale-while-revalidate. Keep freshness/fallback logic explicit. [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).

**Reproduced correctness issue**

The local mock first returned scheduled streams without actual start times. All 180 entries became `video`. After changing the mock to return live details and forcing stored check times old, the next sync made zero YouTube API calls and retained every entry as `video`. The refresh selector excludes that state forever. Separate classification from refresh eligibility and add regression tests.

The live threshold `5 * 60 * 30` is 9 seconds. The two-minute cron prevents nine-second requests in practice: a live entry is eligible on every scheduled run. Choose an intentional interval rather than only changing the arithmetic.

**Verification and testing plan**

- Installed the locked root dependencies using Node 24.19.0. Default system Node 20.10.0 is below the package's declared minimum. Installation used `--ignore-scripts`; required bundler/runtime binaries nevertheless worked in subsequent checks.
- `vue-tsc --build`: passed.
- Direct Vite production build into temporary output: passed; large bundle warning. Standard package scripts still use POSIX environment assignment, `date`, and `cp`, which need cross-platform replacements for Windows.
- Existing Vitest suite: one test, one failure. Missing router/Vuetify setup causes failure before the obsolete `You did it!` assertion.
- Worker `tsc --project worker/src/tsconfig.json --noEmit`: failed due to conflicting WebWorker and Cloudflare type declarations, including `caches.default`. A diagnostic run overriding `--lib ES2022` passed; no configuration was changed.
- Local Miniflare: all migrations applied, 15 members returned, ingestion completed, and `/members`, `/youtube/videos`, `/twitch/livestreams` returned 200 with expected fixture counts. No live external API or production D1 was used.
- Temporary reproduction harness: `node_modules/.audit/integration.mjs`. It bundles an audit-only wrapper and mocks every outbound request. It is not production source or a permanent test suite and will be removed by a clean dependency reinstall.

Prioritize tests for state transitions and refresh deadlines, absent API items, a failed channel among healthy channels, malformed feeds, unchanged-feed SQL/request budgets, filters before limits, stale-cache fallback, partial frontend failures, and visible-page polling. Use fake time and mocked network responses. Add Worker integration tests using real local D1 migrations and Cloudflare's Vitest integration; keep jsdom component/store tests separate. CI should run both type checks, both test suites, build, dependency checks, and a redacted secret scan. [Cloudflare Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/).

**Suggested order**

1. Confirm historical Google key revocation; remove secret-bearing logging and prevent future secret/runtime-state commits. Update vulnerable dependencies with verification.
2. Establish passing local development, separate frontend/Worker tests, shared API contracts, and CI.
3. Refactor refresh selection and ingestion with regression tests and explicit request/SQL budgets. Start with 10-minute discovery and two-minute checks for known active/imminent streams, measuring the user-visible delay.
4. Improve cached read responses, partial-failure behavior, freshness display, and visible-page refresh.
5. Measure HTTP and scheduled CPU separately, daily D1 peaks, statement counts, database size, logs, and upstream errors. Then decide whether the Free tier is practical. Existing paid allowance headroom permits fixing correctness without rushed infrastructure changes.
