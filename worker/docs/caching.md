## Caching strategy

There are a few different types of video. Each will get its own bucket
- yt:videos - videos that are not live streams. Includes Vods, unfortunately. Denoted by having either having an actualEndTime or not having an actualStartTime. Check videos in this list every 5 minutes, perhaps? Would consume approx. 1152 units per day, assuming 4 batches
- yt:streams - live streams. Has actualStartTime, but no actualEndTime. Check every minute, would comsume 2880 units per day assuming 2 streams lasting all day.
- twitch:streams - list of streams. Check the status of LIVE streams every 15 seconds. Check the status of OFFLINE streams every 30 seconds.

When someone sends a request and the cache is stale, just send the stale cache first.

User makes request -> request is processed, data is sent immediately even if stale. If data is stale the data is marked as such, trigger a refresh -> client receives data. Since some data is stale, send a new request to the server with a header attached requesting fresh data. Fresh data comes in and replaces old data.

``` typescript
// Example
fetch('/end/point', {
  header: { 'X-Force-Fresh': 'true'}
})
```
``` typescript
// example shape for cache item
type ApiResult = {
  stale: boolean
  updatedAt: number
  data: Video[]
}

type CachedPayload<T> = {
  updatedAt: number
  data: T
}

type Video = {
  id: string,
  title: string,
  // etc
}

async function getVideos(
  env: Env,
  ctx: ExecutionContext,
  type: 'live' | 'vod',
  requireRefresh: boolean,
  ) {
    const key = `videos:${type}`
    const now = Date.now()
    const age = updatedAt - now
    
    const cached = (await env.KV.get(key, { type: 'json' })) as CachedPayload<Video[]> | null

    if (!cached) {
      const data = await fetchVideosFromUpstream(env, type)
      const payload: CachedPayload<Video[]> = { updatedAt: now, data }
      await env.KV.put(key, )
    }

    let isStale
    if ( age > MAX_VIDEO_TTL ) {

    }
  }
```