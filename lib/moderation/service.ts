import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { games, logs, reports, reviews, users } from "@/lib/db/schema";
import { canPost, limitMessages, recordPost } from "@/lib/limits";
import type { ReportReason } from "@/lib/moderation/reasons";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class ModerationError extends Error {}

// Files the player's report on a visible review that isn't their own.
// Returns false when they have already reported it. The review stays share-
// locked until the report is written, so a hide either waits and then
// resolves this report, or commits first and this report is refused.
export async function reportReview(
  db: Database,
  userId: string,
  reviewId: number,
  reason: ReportReason,
) {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ author_id: string }>(sql`
      SELECT ${logs.userId} AS author_id FROM ${reviews}
      JOIN ${logs} ON ${logs.id} = ${reviews.logId}
      WHERE ${reviews.id} = ${reviewId} AND ${reviews.hiddenAt} IS NULL
      FOR SHARE OF reviews`);
    const review = rows[0];
    if (!review) throw new ModerationError("That review isn't available.");
    if (review.author_id === userId) {
      throw new ModerationError("You can't report your own review.");
    }
    // canPost takes the player's limit lock first, so this sees any report a
    // concurrent request for the same review just wrote. A repeat report
    // changes nothing, so it never counts against the limit.
    const allowed = await canPost(tx, userId, "report");
    const [existing] = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(eq(reports.reviewId, reviewId), eq(reports.reporterId, userId)),
      );
    if (existing) return false;
    if (!allowed) throw new ModerationError(limitMessages.report);
    const inserted = await tx
      .insert(reports)
      .values({ reviewId, reporterId: userId, reason })
      .onConflictDoNothing()
      .returning({ id: reports.id });
    if (inserted.length === 0) return false;
    await recordPost(tx, userId, "report");
    return true;
  });
}

const reviewSummary = {
  id: reviews.id,
  body: reviews.body,
  containsSpoilers: reviews.containsSpoilers,
  author: sql<string>`coalesce(${users.displayUsername}, ${users.username})`,
  game: { slug: games.slug, title: games.title },
};

export const moderationQueueLimit = 50;

// Reviews with open reports, the longest-waiting first.
export async function getOpenReports(db: Database) {
  const firstReported = sql<Date>`min(${reports.createdAt})`;
  const rows = await db
    .select({
      ...reviewSummary,
      reportCount: sql<number>`count(*)::int`,
      reasons: sql<ReportReason[]>`array_agg(distinct ${reports.reason}::text)`,
      firstReported,
    })
    .from(reports)
    .innerJoin(reviews, eq(reviews.id, reports.reviewId))
    .innerJoin(logs, eq(logs.id, reviews.logId))
    .innerJoin(users, eq(users.id, logs.userId))
    .innerJoin(games, eq(games.id, logs.gameId))
    .where(isNull(reports.resolvedAt))
    .groupBy(reviews.id, users.id, games.id)
    .orderBy(asc(firstReported), asc(reviews.id))
    .limit(moderationQueueLimit);
  // node-postgres returns the aggregate as text when it isn't a column.
  return rows.map((row) => ({
    ...row,
    firstReported: new Date(row.firstReported),
  }));
}

// One page of hidden reviews, newest hide first, so a mistaken hide can be
// undone; plus whether older ones remain.
export async function getHiddenReviews(db: Database, page = 1) {
  const rows = await db
    .select({ ...reviewSummary, hiddenAt: reviews.hiddenAt })
    .from(reviews)
    .innerJoin(logs, eq(logs.id, reviews.logId))
    .innerJoin(users, eq(users.id, logs.userId))
    .innerJoin(games, eq(games.id, logs.gameId))
    .where(isNotNull(reviews.hiddenAt))
    .orderBy(desc(reviews.hiddenAt), desc(reviews.id))
    .limit(moderationQueueLimit + 1)
    .offset((page - 1) * moderationQueueLimit);
  return {
    reviews: rows.slice(0, moderationQueueLimit),
    hasMore: rows.length > moderationQueueLimit,
  };
}

const resolveReports = (db: Database | Transaction, reviewId: number) =>
  db
    .update(reports)
    .set({ resolvedAt: sql`now()` })
    .where(and(eq(reports.reviewId, reviewId), isNull(reports.resolvedAt)));

// Hides the review everywhere players read it and closes its reports.
export async function hideReview(db: Database, reviewId: number) {
  await db.transaction(async (tx) => {
    await tx
      .update(reviews)
      .set({ hiddenAt: sql`now()` })
      .where(and(eq(reviews.id, reviewId), isNull(reviews.hiddenAt)));
    await resolveReports(tx, reviewId);
  });
}

// Closes the review's reports and leaves it up.
export async function dismissReports(db: Database, reviewId: number) {
  await resolveReports(db, reviewId);
}

export async function unhideReview(db: Database, reviewId: number) {
  await db
    .update(reviews)
    .set({ hiddenAt: null })
    .where(eq(reviews.id, reviewId));
}
