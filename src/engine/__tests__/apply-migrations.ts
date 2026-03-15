import { applyD1Migrations, env } from "cloudflare:test";

// Runs outside isolated storage — migrations persist across all tests.
// applyD1Migrations() only applies unapplied migrations, so it's idempotent.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
