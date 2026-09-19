import { describe, it, expect } from 'vitest'
import { createRuntime } from './runtime'

describe('upload pages', () => {
  it('pages past 100 videos with tied dates, descriptions and a server-side project filter', async () => {
    const runtime = await createRuntime()
    try {
      await runtime.db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<125)
        INSERT INTO Videos(VideoId,MemberId,Title,Description,PublishedAt,IsProjectSingularity)
        SELECT printf('video-%03d',x),(SELECT MIN(MemberId) FROM Members),'Video','Description',
        '2026-01-01T00:00:00.000Z',x%2 FROM n`).run()
      const seen: string[] = []
      let cursor: string | null = ''
      do {
        const response = await runtime.mf.dispatchFetch(`https://local/youtube/uploads?cursor=${encodeURIComponent(cursor)}`)
        expect(response.status).toBe(200)
        const page = await response.json() as { videos: { videoId: string; description: string }[]; nextCursor: string | null }
        expect(page.videos.length).toBeLessThanOrEqual(10)
        expect(page.videos[0]?.description).toBe('Description')
        seen.push(...page.videos.map(v => v.videoId))
        cursor = page.nextCursor
      } while (cursor)
      expect(seen).toHaveLength(125)
      expect(new Set(seen).size).toBe(125)
      const batchResponse = await runtime.mf.dispatchFetch('https://local/youtube/uploads?limit=100')
      const batch = await batchResponse.json() as { videos: { videoId: string }[]; nextCursor: string }
      expect(batch.videos).toHaveLength(100)
      const archive = await runtime.mf.dispatchFetch('https://local/youtube/uploads?limit=500')
      expect((await archive.json() as { videos: unknown[] }).videos).toHaveLength(125)
      const older = await runtime.mf.dispatchFetch('https://local/youtube/uploads?limit=100&cursor=' + encodeURIComponent(batch.nextCursor))
      expect((await older.json() as { videos: unknown[] }).videos).toHaveLength(25)
      const oversized = await runtime.mf.dispatchFetch('https://local/youtube/uploads?limit=999999')
      expect((await oversized.json() as { videos: unknown[] }).videos).toHaveLength(10)
      const filtered = await runtime.mf.dispatchFetch('https://local/youtube/uploads?project=true')
      const data = await filtered.json() as { videos: { isProjectSingularity: boolean }[] }
      expect(data.videos).toHaveLength(10)
      expect(data.videos.every(v => v.isProjectSingularity)).toBe(true)
      expect((await runtime.mf.dispatchFetch('https://local/youtube/uploads?cursor=invalid')).status).toBe(400)
      expect(runtime.upstream.calls.youtube).toBe(0)
    } finally { await runtime.mf.dispose() }
  })
})
