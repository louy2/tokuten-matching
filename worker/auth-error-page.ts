/**
 * Returns an HTML error page response for auth failures.
 * Shown instead of plain text so mobile/SPA users see a helpful page.
 */
export function authErrorPage(title: string, detail: string, status: number) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login Error</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#111827}
.box{max-width:400px;text-align:center;padding:2rem}.title{font-size:1.25rem;font-weight:700;margin-bottom:.5rem}
.detail{color:#6b7280;font-size:.875rem;margin-bottom:1.5rem}
a{display:inline-block;padding:.5rem 1.5rem;background:#2563eb;color:#fff;border-radius:.5rem;text-decoration:none;font-size:.875rem}
a:hover{background:#1d4ed8}</style></head>
<body><div class="box"><div class="title">${title}</div><div class="detail">${detail}</div>
<a href="/">Back to home</a></div></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
