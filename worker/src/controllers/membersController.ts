import type { Env } from '../env'
import { withCors } from '../utils/http'
import { getAllMemberService } from '../services/authorService'

export async function membersController(
  _req: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const members = await getAllMemberService(env)
  return withCors(JSON.stringify({ members }), {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600' },
  })
}
