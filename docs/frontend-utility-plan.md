# Frontend utility plan

Date: 2026-09-19. Status: implemented locally; not committed, pushed, or deployed in this step.

The user reviewed the first implementation and chose to keep favorites, refresh, response receipt times, and shareable filters. New-since-last-visit, seen/history controls, and Continue where you left off were removed, including their tracking logic. This revision supersedes the original catch-up and saved-reading-position phases.

## Current scope

- Favorite creators using stable member IDs, with accessible stars in the desktop member list and mobile drawer. Videos and streams have independent Everyone/Favorites selections. Favorites persist in localStorage, are separated by API URL, and synchronize between tabs.
- Apply favorites alongside search, project, and creator filters. Preserve chronological video ordering; list favorite live creators first. Filtering and starring do not fetch or manufacture videos. Counts read `Showing X of Y loaded videos`.
- Share filtered list creates a link containing search, project toggles, explicit creator IDs, and page size. Favorites become creator IDs without changing a recipient's favorites. Shared links start on page 1. Offer Copy link and the native browser share dialog where available.
- Preserve ordinary URL pagination, Back/Forward, and saved filter preferences. Descriptions still expand/collapse, with Less buttons at both ends. Do not save reading anchors, expanded descriptions, visit checkpoints, or seen flags. During an in-place refresh, keep an on-screen card steady if the visitor has not interacted; this does not store reading history or restore previous visits.
- Show response receipt times separately for YouTube, Twitch, and uploads. These represent browser retrieval, not the backend's last upstream check. Keep data after refresh failures and distinguish unavailable sources from a successfully empty feed.
- Refresh buttons spin while loading, disable for at least 15 seconds from the click, and show `Please wait · Ns` during any remaining cooldown. Honor a longer server Retry-After.
- Automatically refresh every five minutes only while visible and focused. Return after more than two minutes inactive triggers a refresh. Coalesce overlapping triggers and do not replay missed intervals.
- Fetch 100 uploads on a cold load and only 10 for refreshes or reloads with cached history. Preserve older IndexedDB history and its continuation cursor. Explicit Load all videos follows archive pages in batches of 500, with bounded backoff and Stop support. A non-overlapping refreshed head exposes a gap for explicit Load all to fill.
- Keep cache resets independent of favorite resets. Ignore retired new/seen/position preferences. Existing IndexedDB version 2 databases remain compatible; any old seen store is unused. Legacy version 1 video snapshots remain readable through upgrade.

## Investigation: increments of exactly 50

Read-only inspection of the staging public uploads API returned 603 unique uploads: 12 creators with 50 each and Mastiox with 3. The fallback discovery code requests the first 50 items of each uploads playlist. Thus adding many creators to a fully loaded favorites filter adds exactly 50 existing matches. The frontend neither requests another batch nor duplicates data when a favorite changes.

Load all means all uploads stored by this backend, not the creator's entire YouTube history. A deeper historical import would be a separate backend change and is not included here.

## Validation

- 26 frontend tests passed, covering favorites persistence and cache independence, filter counts with unequal creator totals, zero extra requests from favorite changes, share-link creator IDs, URL navigation, cache migration, source failures, and refresh scheduling/backoff.
- Legacy enabled new/seen filters are seeded in the browsing regression and no longer hide results. Removed controls are absent.
- TypeScript and production build passed. The existing bundle-size warning remains.
- Local browser verification checked removed controls, renamed sharing panel, receipt labels, and ordinary description controls against staging.

## Backend follow-up, separately scoped

The subsequent [bug audit](2026-09-19-bug-audit.md) adds cache, response-validation, stream-selection, and mobile-background fixes. Its validation results supersede the earlier counts above: 35 frontend tests and 112 backend tests passed, along with types, lint, and the production build. The audit records remaining limitations and the local-only deployment status.

Upcoming streams need reliable scheduled start times and a defined public upcoming state. Authoritative freshness needs upstream-check timestamps and source health. Deeper historical imports need separate quota/cost planning. No Worker, database, account, or analytics changes are required for the current frontend scope.
