import { describe, expect, it } from 'vitest'
import { createRuntime } from './runtime'
import { RECENT_VIDEOS_SQL } from '../src/db/videos'

describe('Twitch recovery and efficient video reads', () => {
  it('returns controlled JSON with CORS when the Twitch secret is absent', async () => {
    const runtime = await createRuntime({ missingTwitchSecret: true })
    try {
      const response = await runtime.mf.dispatchFetch('https://worker.invalid/twitch/livestreams')
      expect(response.status).toBe(500)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(await response.json()).toEqual({ error: 'There was a server-side error' })
      expect(runtime.upstream.calls.token).toBe(0)
    } finally { await runtime.mf.dispose() }
  })
  it('reacquires an app token once on a 401 and returns stream data', async () => {
    const runtime = await createRuntime()
    try {
      runtime.upstream.twitchStatuses = [401, 200]
      const response = await runtime.mf.dispatchFetch('https://worker.invalid/twitch/livestreams')
      expect(response.status).toBe(200)
      expect(runtime.upstream.calls).toMatchObject({ twitch: 2, token: 2 })
    } finally { await runtime.mf.dispose() }
  })
  it.each([401, 429, 503])('bounds retries for repeated HTTP %s failures', async status => {
    const runtime = await createRuntime()
    try {
      runtime.upstream.twitchStatuses = [status, status, status]
      const response = await runtime.mf.dispatchFetch('https://worker.invalid/twitch/livestreams')
      expect(response.status).toBe(500)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(await response.json()).toEqual({ error: 'There was a server-side error' })
      expect(runtime.upstream.calls.twitch).toBe(status === 401 ? 2 : 1)
    } finally { await runtime.mf.dispose() }
  })
  it('does not fetch a token or streams when no Twitch creators are configured', async () => {
    const runtime = await createRuntime()
    try {
      await runtime.db.prepare('UPDATE Members SET Twitch=NULL').run()
      const response = await runtime.mf.dispatchFetch('https://worker.invalid/twitch/livestreams')
      expect(await response.json()).toEqual({ liveStreams: [] })
      expect(runtime.upstream.calls).toMatchObject({ token: 0, twitch: 0 })
    } finally { await runtime.mf.dispose() }
  })
  it('does not report malformed Twitch data as everybody being offline', async () => {
    const runtime = await createRuntime()
    try {
      runtime.upstream.invalidTwitch = true
      expect((await runtime.mf.dispatchFetch('https://worker.invalid/twitch/livestreams')).status).toBe(500)
    } finally { await runtime.mf.dispose() }
  })
  it('matches a full-history sort including old live streams and missing status rows', async () => {
    const runtime = await createRuntime()
    try {
      await runtime.db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2000)
        INSERT INTO Videos(VideoId,MemberId,Title,PublishedAt)
        SELECT 'history-'||x,(SELECT MIN(MemberId) FROM Members),'Video '||x,
        datetime('2020-01-01','+'||x||' minutes') FROM n`).run()
      await runtime.db.prepare(`INSERT INTO VideoLiveStatus(VideoId,State,LastChecked)
        SELECT VideoId,CASE WHEN VideoId IN ('history-1','history-2') THEN 'live' ELSE 'video' END,0
        FROM Videos WHERE VideoId!='history-2000'`).run()
      const optimized = await runtime.db.prepare(RECENT_VIDEOS_SQL).bind(100,100,100).all<{ VideoId: string }>()
      const baseline = await runtime.db.prepare(`SELECT v.VideoId FROM Videos v LEFT JOIN VideoLiveStatus ls ON ls.VideoId=v.VideoId
        ORDER BY (COALESCE(ls.State,'video')='live') DESC,v.PublishedAt DESC LIMIT 100`).all<{ VideoId: string }>()
      expect(optimized.results.map(v => v.VideoId)).toEqual(baseline.results.map(v => v.VideoId))
      expect(optimized.results[0]!.VideoId).toBe('history-2')
      expect(optimized.results[2]!.VideoId).toBe('history-2000')
      expect(optimized.meta.rows_read).toBeLessThan(baseline.meta.rows_read)
      const plan = await runtime.db.prepare(`EXPLAIN QUERY PLAN ${RECENT_VIDEOS_SQL}`).bind(100,100,100).all()
      expect(JSON.stringify(plan.results)).toMatch(/idx_videos_(publishedat_desc|page)/)
      expect(JSON.stringify(plan.results)).toContain('idx_status_state_checked')
    } finally { await runtime.mf.dispose() }
  })
})
