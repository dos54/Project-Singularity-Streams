# Twitch recordings

The Worker builds an independent Twitch VOD snapshot in KV (`twitch-vods:v1`) on the first scheduled invocation and every two hours thereafter. No new database migration or credentials are required. The existing D1 WorkerLeases table prevents concurrent sweeps; ordinary visitor requests to `/twitch/videos` only read KV behind the existing edge cache and cost guard.

Each sweep resolves the roster's Twitch accounts, checks current streams in one batch, and lists `type=archive` videos per creator. Active stream IDs are excluded. Complete per-creator snapshots replace prior snapshots, removing expired or deleted broadcasts. Pagination is bounded at five pages of 100 per creator and a roster of 20; incomplete, malformed, cyclic, or failed responses preserve the previous complete channel snapshot and mark the response stale. Snapshots older than six hours are withheld. Failures retry at the next two-hour sweep, avoiding aggressive outage retries.

For five creators with one page each, a normal sweep is seven Helix requests: one user lookup, one live-stream lookup, and five archive lists. Twelve sweeps/day means approximately 84 requests/day or 2,520 per 30 days, plus token requests and additional pages. KV is read once per cron tick, written once per sweep, and read on uncached visitor requests. This estimate excludes the existing live/YouTube work and is not a billing ceiling.

The frontend combines these recordings with the existing YouTube archive, preserving shared search, favorites, pagination, and project filtering. `platform` is encoded in shareable URLs. Twitch IDs are namespaced (`twitch:123`) to avoid collisions, and cards link to Twitch recordings and creator channels. Matching titles are not sufficient proof of duplicate broadcasts across platforms, so no automatic cross-platform merging is attempted.

Twitch does not supply an expiration timestamp or cross-platform YouTube ID in Get Videos. Source: https://dev.twitch.tv/docs/api/reference/#get-videos

Twitch browser storage is a separate, replaceable snapshot, never merged into the permanent YouTube archive. Recent saved recordings restore immediately; every initial load and video refresh requests the Worker snapshot. Saved entries older than two hours are not restored, and an unsuccessful refresh drops an in-memory snapshot after two hours. Clearing the site's video cache clears both stores. Failed Twitch reads show a separate warning without blocking YouTube. A successful empty response clears saved Twitch entries, including across later visits.

New recordings and expirations normally appear after the next two-hour sweep plus cache/browser refresh time. Creators must publish their recordings on Twitch. Project filtering uses the same title/description keyword policy as YouTube; disable Project Singularity only to view other recordings.

Release procedure: deploy the Worker first, verify `/twitch/videos` populates after cron, then publish the frontend. Production backend deployed September 25, 2026 UTC as Worker version `68abe97a-3a79-4cd5-b4c6-20a1c4197ee6`. Frontend publication is tracked by the main-branch GitHub Pages workflow for this release commit.
