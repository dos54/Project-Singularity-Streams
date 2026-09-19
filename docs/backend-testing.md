# Backend regression suite

Run from the repository root using Node 20.19+ or 22.12+ (Node 24.19 was used for the initial run):

```sh
npm ci
npm run check:backend
```

`check:backend` checks Worker and test TypeScript separately, then runs the backend tests once. `npm run test:backend:watch` runs watch mode. Frontend tests remain separate under `npm run test:unit`; the existing frontend starter test is still broken and is outside this backend pass.

The suite now contains **107 tests, with no skipped or expected-failure cases**, including temporary diagnostic subscriber checks and scheduled API fallback/recovery tests. All six defects captured by the initial baseline have been fixed and retained as ordinary regression checks. No suite can guarantee the absence of defects or validate Cloudflare billing limits from local execution.

| File | Coverage |
| --- | --- |
| `worker/tests/video.test.ts` | Project classification, Atom parsing, field mapping, status joins, response shape |
| `worker/tests/upstream.test.ts` | HTTP status and timeout classification without leaking credentials or response bodies |
| `worker/tests/youtube.test.ts` | Empty requests, batching, URL encoding, upstream errors, refresh eligibility |
| `worker/tests/cache.test.ts` | Cache hits, response cloning, query normalization, sensitive requests, non-cacheable responses |
| `worker/tests/integration.test.ts` | Actual Worker entry point and cron handler, real local D1 migrations, endpoints, repeated ingestion, metadata changes, partial feed failure, empty feeds, upstream request budget, completed streams, Twitch token reuse |
| `worker/tests/regressions.test.ts` | Fixed status, timing, credential-logging and minimal-payload regressions |
| `worker/tests/websub.test.ts` | Real webhook routing, signatures, challenge verification, size/XML/channel validation, durable inbox, replay protection, authoritative enrichment, backoff, renewal, reconciliation, live lifecycle, bounded bursts and overlapping cron runs |

Each integration case starts a fresh Miniflare instance with non-persistent D1/KV. It bundles `worker/src/index.ts`, applies every SQL migration, and calls the actual scheduled handler through `getWorker().scheduled()`. HTTP responses are exercised through `dispatchFetch()`.

Production Wrangler configuration, `.env` files, and credentials are not loaded. Dummy bindings are supplied explicitly. All upstream requests are mocked and unknown outbound URLs are rejected. Unit tests also reject unexpected `fetch()` calls. There is no production database access or API quota consumption.

Miniflare and esbuild are direct, pinned development dependencies using the versions already present in the lockfile. This avoids combining the baseline work with a runtime/toolchain upgrade. The previously documented dependency advisories remain a separate next step. This suite uses Vitest's Node runner plus Miniflare's API; it does not install the Cloudflare Vitest pool/plugin.

**Fixed baseline defects**

The initial 44-test baseline used six expected failures. Those are now normal passing tests:

| ID | Fixed defect | Location |
| --- | --- | --- |
| B1 | Ended streams remained live when viewer/chat data was still present | `regressions.test.ts` |
| B2 | A started stream without public viewer count/chat was classified as a video | `regressions.test.ts` |
| B3 | The documented five-minute live threshold evaluated to nine seconds | `regressions.test.ts` |
| B4 | Failed YouTube requests logged the API key in the URL | `regressions.test.ts` |
| B5 | Minimal push payloads without `media:group` crashed the mapper | `regressions.test.ts` |
| B6 | Upcoming entries classified as videos were never rechecked | `integration.test.ts` |

The Worker type configuration uses the Cloudflare runtime types without conflicting WebWorker globals. The frontend test config includes only frontend tests, preventing accidental collection of backend tests under jsdom. The implementation now includes push ingestion behind an opt-in flag and migration 0006; see [operations and rollout](youtube-push-operations.md). No production deployment has been performed.

**Automation and remaining validation**

GitHub Actions runs `npm ci` and `npm run check:backend` on pushes and pull requests, with Node 24 and no Cloudflare/YouTube secrets. A real hub challenge/delivery/renewal and hosted cost measurements still require staging. The Worker-only XML parser was upgraded to 5.11.1 in both manifests/lockfiles; the other dependency advisories from the audit remain separate work.

Current limits: local Miniflare does not enforce or predict every hosted-plan limit, third-party behavior is represented by fixtures, and the simple migration loader assumes the current migrations contain no embedded semicolons or SQL trigger bodies. Replace that loader with a migration-aware executor before adding such migrations. Production deployment smoke tests and billing measurements remain separate.
