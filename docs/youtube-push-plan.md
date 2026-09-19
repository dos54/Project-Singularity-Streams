# YouTube push ingestion proposal

Status: original design, now implemented locally with migration 0006 and an opt-in flag. No production deployment or real hub subscriptions have been made. The [operations guide](youtube-push-operations.md) describes the implemented behavior, staging setup, limits and rollback; it supersedes proposed details below.

YouTube supports PubSubHubbub notifications, part of the protocol family now standardized as WebSub. It is a server-to-server webhook subscription. It does not require creating a Google Cloud Pub/Sub topic or a browser push-notification service.

Google documents notifications for video uploads and changes to titles/descriptions. The notification carries channel and video IDs in an Atom payload. Public channel feed subscriptions do not require creators to grant the site OAuth access. Live start/end, deletion/private visibility, and every other possible change should not be assumed to have reliable documented notifications. [YouTube guide](https://developers.google.com/youtube/v3/guides/push_notifications).

**Proposed flow**

1. For each known member, record a pending subscription in D1 and POST its channel feed topic plus our public HTTPS callback URL to Google's hub. Supply a shared signing secret. Subscription requests are distinct from `videos.list` enrichment requests.
2. The hub calls our callback with a GET challenge. Validate that the topic, intended action, and subscription identity match a pending request; echo the challenge exactly. Record the granted lease, rather than assuming a fixed expiration.
3. When content changes, the hub POSTs an Atom notification. Bound the body size, verify its signature over the raw bytes using the subscribed secret, and validate the payload/channel. Do not trust arbitrary URLs in a webhook body or fetch them.
4. Durably record/deduplicate the affected video IDs and event timestamps in a small D1 inbox before responding successfully. A `waitUntil` task alone is not durable acknowledgement. A database failure should leave the event eligible for hub retry.
5. Process pending IDs in bounded batches. Fetch complete metadata and live details through `videos.list`, confirm the channel matches the member, and upsert normalized records. Retry transient failures with backoff. Fetching authoritative current metadata also helps prevent an older notification from overwriting newer data.
6. The existing read API and frontend consume the updated D1 records. Edge/browser cache TTLs still bound visibility; open pages will later need polling or a separate server-to-browser mechanism.

PubSubHubbub specifies challenge verification, expiring leases/renewal, retryable delivery, and HMAC signatures when a secret is supplied. Google's actual callback signature and lease behavior should be verified in staging; do not assume that a hub implements every newer WebSub option. [PubSubHubbub 0.4 protocol](https://pubsubhubbub.github.io/PubSubHubbub/pubsubhubbub-core-0.4.html), [WebSub recommendation](https://www.w3.org/TR/websub/).

**Fit to this repository**

- Add a dedicated `/youtube/webhook/{callback-id}` GET/POST handler that bypasses public response caching. Keep subscription-management operations private or CLI-driven rather than exposing an unauthenticated refresh/subscription endpoint.
- Add migrations for channel subscriptions (topic, callback identifier, state, lease expiry, renewal/error timestamps) and pending video work (video ID, channel ID, event version, retry deadline/attempts). Store signing material in Worker secrets, not Git or public responses.
- Separate webhook parsing from the full-feed mapper. Google's documented sample omits `media:group`; this was regression B5 and is now fixed. Push ingestion extracts IDs independently and enriches through the Data API.
- Extract shared metadata enrichment/upsert functions for both notifications and reconciliation. Keep batch size, attempts, and per-run work bounded so a delivery burst does not cause unlimited API or database work.
- Initially use D1 for the durable inbox rather than introducing another service. A small scheduled task can drain failed/pending work, renew due subscriptions, and check known live/upcoming videos. Optionally attempt immediate processing after the durable write using `waitUntil`; retained inbox state provides recovery if that attempt fails.
- Keep a slower reconciliation feed sweep, for example every six hours initially, plus startup/backfill. For 15 channels, four sweeps/day is 1,800 feed requests per 30 days, versus the current 324,000. This comparison excludes webhook deliveries, renewals, enrichment, retries, and ongoing live checks; it is not a total request-count or cost forecast.
- Keep bounded live-status polling. Notifications reduce discovery polling but do not remove state transitions or the need to handle silent/missed events.

This makes normal ingestion proportional to changed videos, but adds webhook authentication, durable delivery handling, and subscription lifecycle work. It simplifies the steady-state data flow rather than eliminating all scheduled work.

**Implementation responsibilities**

I can implement local schema migrations, callback verification, signature validation, inbox/deduplication, enrichment, renewal/retry scheduling, reconciliation, configuration examples, CLI setup commands, and tests. I can prepare a deployable staging build and execute account operations when an authenticated CLI/connector and the necessary authorization are available.

The user needs to authenticate Cloudflare access on this computer if it is not already available, make the active YouTube API key available through Worker secrets (not chat), and authorize the eventual staging/production deployment and cutover. A workers.dev HTTPS address can provide the callback; a custom domain is optional. The existing creators do not need to log in or install anything for public feed subscriptions. Initial subscriptions and renewals can be automated by the implementation rather than manually maintained by the user.

Roll out in staging with synthetic signed callbacks first, verify one real channel's subscription/delivery/renewal, run alongside polling long enough to compare results, then reduce discovery polling. No deployment is necessary to build and test the local implementation.
