/** Cloudflare bindings shared across all routes */
export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
  DISCORD_BOT_TOKEN: string;
  CRON_SECRET: string;
}
