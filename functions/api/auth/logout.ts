import type { Env } from "../_auth";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const cookie = context.request.headers.get("Cookie") ?? "";
  const sessionId = cookie.match(/session=([^;]+)/)?.[1];

  if (sessionId) {
    await context.env.SESSIONS.delete(`session:${sessionId}`);
  }

  const response = new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });

  response.headers.append(
    "Set-Cookie",
    "session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0",
  );

  return response;
};
