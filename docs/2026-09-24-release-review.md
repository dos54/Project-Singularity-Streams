# Release review — September 24, 2026 (Alaska)

Release status: the reviewed Worker was deployed September 25 at approximately 01:18 UTC as version `14b3d568-6619-45f2-8f91-d385cf1a40bc`. The frontend is released through the main-branch GitHub Pages workflow; check that workflow for publication status. The observations below describe the pre-release review. Approved visual checkpoint remains `c793095`, tagged `checkpoint/2026-09-19-hero-polish`.

## Hecuba's missing stream

Read-only checks at approximately September 25 01:01 UTC confirmed:

- Production member 3 correctly maps Hecuba to `@HecubaLive`, channel `UCCJ4cFgBxQbyQ2BazCbTPgg`.
- YouTube's public live page identified `yraZytPFHvw`, **Finally Building Naqfuel 4 (Maybe for real this time) | Project Singularity Livestream #99**, as live. RSS returned HTTP 200 and included it, published at September 24 23:05:57 UTC.
- The video was absent from production Videos and YoutubeInbox. Yesterday's stream #98 was present. This is a discovery gap, not a frontend filter or incorrect channel mapping.
- The last successful feed check was September 24 19:32:51 UTC; the next was scheduled for September 25 01:32:51 UTC. A valid subscription lease plus `FeedHealthy=1` disabled API fallback and left the six-hour RSS interval in effect.
- All fifteen production subscriptions had `LastDeliveryAt=NULL`: none had recorded an accepted webhook. This does not identify the cause of missing delivery. No matching webhook events were returned by the queried observability window. Google's detailed subscription diagnostics require the matching secret; the unauthenticated check could not provide delivery details. No secret was read or transmitted in this review.

Flurben's working stream and yesterday's Hecuba video are consistent with successful prior discovery or a separate Twitch source; they do not establish reliable current YouTube webhook delivery.

## Changes

1. Successful RSS feeds are checked every ten minutes even with a healthy subscription. Up to fifteen due channels run per cron with concurrency three; failed feeds back off thirty minutes and API fallback retains its ten-minute schedule. Legacy six-hour schedules are shortened automatically on deployment. No migration is needed.
2. Reconciliation uses event timestamps to deduplicate unchanged feed entries instead of refreshing their metadata every sweep. Existing live/upcoming checks remain independent. New stream discovery still depends on upstream feed availability, cron timing, queue backlog and browser/cache refresh.
3. Safe logs distinguish accepted webhook deliveries from discarded invalid signatures and record successful RSS checks. Subscription acceptance is no longer the only visible diagnostic.
4. Malformed YouTube item arrays, descriptions, live dates and thumbnail metadata now enter bounded retry rather than crashing cron processing or storing an invalid live claim. Recovery is tested.
5. Updated transitive PostCSS and Nano ID packages within existing dependency ranges. Production dependency audit now reports zero advisories; this is not an exhaustive exploitability or dev-dependency audit.

The ten-minute watchdog is about 2,160 RSS requests/day for fifteen healthy channels (64,800 per thirty days), excluding other work. That is 80% below polling all feeds every two minutes, but higher than the previous unreliable six-hour reconciliation design. RSS requests use no YouTube Data API quota; changed/new events and live checks still require enrichment API calls. Measure hosted CPU and database costs after deployment; no hard billing-cap claim is made.

## Verification and release boundary

Frontend: 35 tests and production build/type checks passed after dependency updates. Backend: full suite passed with 117 tests, followed by a targeted final ingestion run with all 39 cases passing after adding one more malformed-thumbnail case (118 total backend cases now). Backend types, lint and Worker production packaging dry run passed. The pre-existing large frontend bundle warning remains.

Deploy the Worker fix before evaluating production discovery; pushing main only deploys the GitHub Pages frontend. After deployment, verify that Hecuba's video is enriched (it may have ended by then), feed-check timestamps advance on the new schedule, and accepted/rejected webhook logs distinguish actual delivery from reconciliation. The visual checkpoint has not been changed.

Remaining follow-ups: prove actual Google hub delivery, measure scheduled CPU with the larger bounded feed batch, consider explicitly sampled Workers traces (currently only observability logs are configured), and add authoritative upstream freshness/deletion metadata if desired. Old browser-cached video metadata still has the previously documented limitations.
