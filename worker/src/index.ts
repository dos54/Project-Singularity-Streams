export interface Env {
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAppToken(env: Env): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const resp = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  if (!resp.ok) throw new Error(`Token error: ${resp.status}`);
  const json = await resp.json();
  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + json.expires_in * 1000;
  return cachedToken!;
}

// Default worker function
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Anything other than /twitch/live returns 404
    const url = new URL(request.url);

    if (url.pathname !== '/twitch/live') {
      return new Response('Not found', { status: 404 });
    }

    // Get the logins from the query params
    const loginsParam = url.searchParams.get('logins') ?? '';
    const logins = loginsParam
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (!logins.length) {
      return new Response(JSON.stringify({ error: 'No logins provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get cached token, or new token if there is no cached tokane
    const token = await getAppToken(env);
    const qs = logins.map(l => `user_login=${encodeURIComponent(l)}`).join('&');

    const twitchResp = await fetch(
      `https://api.twitch.tv/helix/streams?${qs}`,
      {
        headers: {
          'Client-Id': env.TWITCH_CLIENT_ID,
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!twitchResp.ok) {
      return new Response(
        JSON.stringify({ error: 'Twitch error', status: twitchResp.status }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Map the resposne into something simpler
    const body = await twitchResp.json();
    const liveMap = new Map<string, any>();
    for (const s of body.data ?? []) {
      liveMap.set(String(s.user_login).toLowerCase(), s);
    }

    const result = logins.map(login => {
      const stream = liveMap.get(login.toLowerCase());
      return {
        login,
        isLive: !!stream,
        title: stream?.title ?? null,
        gameName: stream?.game_name ?? null,
        viewerCount: stream?.viewer_count ?? null,
      };
    });

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
