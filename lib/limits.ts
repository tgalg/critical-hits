import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type PostKind = "review" | "list" | "report";

// How many of each a player may post per hour. Accounts younger than a day
// get the lower number, which slows spam from fresh sign-ups without getting
// in a real player's way.
export const hourlyLimits: Record<
  PostKind,
  { newAccount: number; account: number }
> = {
  review: { newAccount: 5, account: 30 },
  list: { newAccount: 3, account: 20 },
  report: { newAccount: 10, account: 30 },
};

const recent = {
  review: (userId: string) =>
    sql`SELECT count(*) FROM activities WHERE actor_id = ${userId} AND verb = 'reviewed' AND created_at > now() - interval '1 hour'`,
  list: (userId: string) =>
    sql`SELECT count(*) FROM activities WHERE actor_id = ${userId} AND verb = 'created_list' AND created_at > now() - interval '1 hour'`,
  report: (userId: string) =>
    sql`SELECT count(*) FROM reports WHERE reporter_id = ${userId} AND created_at > now() - interval '1 hour'`,
};

// Whether the player may post one more of this kind now. Concurrent posts
// can each pass the check, so the limit is soft by at most a few posts.
export async function canPost(
  db: Database | Transaction,
  userId: string,
  kind: PostKind,
) {
  const { rows } = await db.execute<{ is_new: boolean; posted: number }>(sql`
    SELECT created_at > now() - interval '1 day' AS is_new,
           (${recent[kind](userId)})::int AS posted
    FROM users WHERE id = ${userId}`);
  const row = rows[0];
  if (!row) return false;
  const limit = hourlyLimits[kind];
  return row.posted < (row.is_new ? limit.newAccount : limit.account);
}

export const limitMessages: Record<PostKind, string> = {
  review: "You've posted a lot of reviews in the last hour. Try again later.",
  list: "You've made a lot of lists in the last hour. Try again later.",
  report: "You've sent a lot of reports in the last hour. Try again later.",
};
