import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

/** Create a Drizzle instance from a D1 binding. */
export function getDb(d1: D1Database): DrizzleD1Database {
  return drizzle(d1);
}
