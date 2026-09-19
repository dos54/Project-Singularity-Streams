# Frontend utilities and refresh (2026-09-19)

Implemented locally; see `frontend-utility-plan.md` for current scope and backend deferrals. Not committed, pushed, or deployed in this step.

- Favorites remain in the member list/drawer, with independent Everyone/Favorites choices for videos and streams. Changes filter cached videos locally without extra requests. Counts read `Showing X of Y loaded videos`.
- Share filtered list replaces Share view. Links include search, explicit creator IDs, project filters, and page size, and open on page 1. A favorite selection is translated into creator IDs.
- Removed New since last visit, Hide seen, New badges, seen/unseen controls and undo, visit tracking, and Continue where you left off. Old preferences for these features are ignored. Reading positions and description expansion are no longer persisted. Normal pagination/filter history remains, and refreshes avoid moving a visible card when possible.
- Refresh buttons retain the spinner, 15-second minimum cooldown, and `Please wait · Ns` countdown. Server Retry-After can extend it.
- Automatic refresh occurs every five minutes only while visible and focused, and on returning after more than two minutes inactive. Requests are coalesced and missed intervals are not replayed.
- Cold loads request 100 uploads; cached reloads and refreshes request 10. Explicit Load all follows archive pages of 500 while preserving downloaded history in IndexedDB. A head gap requires explicit archive loading.
- Per-source receipt times describe browser retrieval. Failures preserve previous results with an explanation; unknown stream availability is not reported as a definitive zero.
- Favorites and cache snapshots are separated by API URL. Cache and favorite resets remain independent. Existing IndexedDB v1/v2 snapshots remain compatible; retired seen state is unused.

The staging 50-video increments are real stored matches: public API inspection found 603 unique uploads (12 creators with 50, one with 3). Backend fallback discovery fetches the first 50 uploads per channel. Favorites do not load or create another 50. Load all currently means all backend-stored uploads, not every historical video on YouTube.

Validation: 26 frontend tests, frontend TypeScript, production build, and local browser checks passed. The existing large-bundle warning remains. Backend checks were not rerun for this frontend-only revision.

The earlier notes below describe prior implementation milestones.

# Frontend preview and upload pages

Latest Videos uses `/youtube/uploads?limit=100&cursor=...` with 100 records per batch.
The API still defaults to 10; only the explicit value 100 selects the larger batch.
The opaque next cursor orders by publication date and video ID. The frontend filters
loaded videos instantly by project, creator, and title/description text. The initial
load fetches only the latest 100. "Load all videos" near the filters automatically
follows every remaining cursor, showing progress and offering Stop. Completed batches
remain available if interrupted; retries resume from the last successful cursor.
Loaded history and its continuation cursor persist in IndexedDB, separately for each
API base URL. Returning visits restore it then refresh the newest 100, updating existing
records and preserving older history. Old cached metadata can remain stale; browser
storage clearing/eviction removes it. Failed storage writes show a visible notice.
Archive requests now use 500-record batches and one-hour shared caching; the initial
100-record response retains a 30-second cache. The existing rate guard is unchanged.
Rate-limited responses show a seconds countdown and are retried at most twice per
batch. Search covers loaded history; after completion it covers all fetched uploads.
Display sizes are 10/20/50/100, independent of fetch size. Both project toggles and
display size persist in localStorage. A valid `?pageSize=20` overrides the saved size;
changing size updates the URL without adding browser history entries.
Desktop uses independent alternating columns; mobile retains chronological order.
The endpoint retains shared caching and the existing per-route cache-miss rate guard.
Descriptions are escaped text with web links, collapsed to two lines plus a faded partial third line.

Before using the new page controls against staging, apply the index migration and deploy:

```powershell
npx wrangler d1 migrations apply singularitystream-staging-db --remote --config worker/wrangler.staging.jsonc
npx wrangler deploy --config worker/wrangler.staging.jsonc
```

Run `npm run dev:staging`. The development-only livestream preview switch displays
YouTube-only, Twitch-only, and combined mock cards without changing the database.
The preview fixture module is excluded from production builds.

On September 19, a direct request to staging `/twitch/livestreams` returned HTTP 500,
Cloudflare error 1101, without CORS headers. This is a server failure, not evidence
of a localhost-only CORS restriction. Its underlying exception still needs checking
in Worker observability. The UI preserves other successfully loaded streams.

Validation: staging build, 108 backend tests and 6 frontend card tests passed.
The pagination test traverses 125 same-date records without omissions or duplicates.
Batch/filter update: staging build, backend type checks, 8 frontend tests, and 4 targeted
backend pagination/cost-guard tests passed. No additional migration is needed for batches.
