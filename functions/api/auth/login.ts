import type { Env } from "../_auth";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DISCORD_CLIENT_ID, DISCORD_REDIRECT_URI } = context.env;

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state,
  });

  const response = new Response(null, {
    status: 302,
    headers: { Location: `https://discord.com/api/oauth2/authorize?${params}` },
  });

  // Store state in a short-lived cookie to validate on callback
  response.headers.append(
    "Set-Cookie",
    `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`,
  );

  return response;
};
