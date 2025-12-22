import { Env } from "../env";
import { withCors } from "../utils/http";
import { getAllMemberService } from "../services/authorService";

export async function membersController(
  req: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(req.url)
  const { pathname } = url
  const segments = url.pathname.split('/').filter(Boolean)

  try {
    switch(segments[1]) {
      default: {
        const members = await getAllMemberService(env)
        return withCors(JSON.stringify({ members }), {
          headers: {
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600',
          },
        })
      }
    }
  } catch (err) {
    return new Response(
      'Not found',
      { status: 404 }
    )
  }
}
