import { and, eq, lt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { postingEvents } from "@/lib/db/schema";

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

// Reviews and lists are counted from posting_events, which deleting a post
// leaves alone; reports are never deleted by their reporter.
const recent = {
  review: (userId: string) =>
    sql`SELECT count(*) FROM posting_events WHERE user_id = ${userId} AND kind = 'review' AND created_at > now() - interval '1 hour'`,
  list: (userId: string) =>
    sql`SELECT count(*) FROM posting_events WHERE user_id = ${userId} AND kind = 'list' AND created_at > now() - interval '1 hour'`,
  report: (userId: string) =>
    sql`SELECT count(*) FROM reports WHERE reporter_id = ${userId} AND created_at > now() - interval '1 hour'`,
};

// Whether the player may post one more of this kind now. Must run inside the
// transaction that records the post: it takes a per-player lock held until
// that transaction ends, so concurrent posts are counted one after another
// instead of all passing the same check.
export async function canPost(tx: Transaction, userId: string, kind: PostKind) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`post-limit:${userId}`}))`,
  );
  const { rows } = await tx.execute<{ is_new: boolean; posted: number }>(sql`
    SELECT created_at > now() - interval '1 day' AS is_new,
           (${recent[kind](userId)})::int AS posted
    FROM users WHERE id = ${userId}`);
  const row = rows[0];
  if (!row) return false;
  const limit = hourlyLimits[kind];
  return row.posted < (row.is_new ? limit.newAccount : limit.account);
}

// Records a new review or list against the player's limit, dropping their
// records too old to count.
export async function recordPost(
  db: Database | Transaction,
  userId: string,
  kind: "review" | "list",
) {
  await db
    .delete(postingEvents)
    .where(
      and(
        eq(postingEvents.userId, userId),
        lt(postingEvents.createdAt, sql`now() - interval '1 hour'`),
      ),
    );
  await db.insert(postingEvents).values({ userId, kind });
}

export const limitMessages: Record<PostKind, string> = {
  review: "You've posted a lot of reviews in the last hour. Try again later.",
  list: "You've made a lot of lists in the last hour. Try again later.",
  report: "You've sent a lot of reports in the last hour. Try again later.",
};
