/**
 * Creates a 302 redirect response with an HTML fallback body.
 *
 * Some mobile browsers (especially Brave with Shields enabled) may not
 * follow a bare 302 redirect. This response includes:
 * - Standard Location header for the redirect
 * - HTML body with meta-refresh as a fallback
 * - A visible clickable link for manual navigation
 *
 * This ensures users always have a way to proceed.
 */
export function redirectWithFallback(
  url: string,
  options?: { cookies?: string[] },
): Response {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${url}">
<title>Redirecting…</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#111827}
.box{text-align:center;padding:2rem}
a{color:#2563eb;text-decoration:underline;font-size:.875rem}</style></head>
<body><div class="box"><p>Redirecting…</p><p><a href="${url}">Click here if you are not redirected</a></p></div></body></html>`;

  const response = new Response(html, {
    status: 302,
    headers: {
      Location: url,
      "Content-Type": "text/html; charset=utf-8",
    },
  });

  if (options?.cookies) {
    for (const cookie of options.cookies) {
      response.headers.append("Set-Cookie", cookie);
    }
  }

  return response;
}
