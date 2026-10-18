import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { games, logs, reports, reviews, users } from "@/lib/db/schema";
import { canPost, limitMessages } from "@/lib/limits";
import type { ReportReason } from "@/lib/moderation/reasons";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class ModerationError extends Error {}

// Files the player's report on a visible review that isn't their own.
// Returns false when they have already reported it.
export async function reportReview(
  db: Database,
  userId: string,
  reviewId: number,
  reason: ReportReason,
) {
  const [review] = await db
    .select({ authorId: logs.userId })
    .from(reviews)
    .innerJoin(logs, eq(logs.id, reviews.logId))
    .where(and(eq(reviews.id, reviewId), isNull(reviews.hiddenAt)))
    .limit(1);
  if (!review) throw new ModerationError("That review isn't available.");
  if (review.authorId === userId) {
    throw new ModerationError("You can't report your own review.");
  }
  if (!(await canPost(db, userId, "report"))) {
    throw new ModerationError(limitMessages.report);
  }
  const inserted = await db
    .insert(reports)
    .values({ reviewId, reporterId: userId, reason })
    .onConflictDoNothing()
    .returning({ id: reports.id });
  return inserted.length > 0;
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

// The most recently hidden reviews, so a mistaken hide can be undone.
export async function getHiddenReviews(db: Database) {
  return db
    .select({ ...reviewSummary, hiddenAt: reviews.hiddenAt })
    .from(reviews)
    .innerJoin(logs, eq(logs.id, reviews.logId))
    .innerJoin(users, eq(users.id, logs.userId))
    .innerJoin(games, eq(games.id, logs.gameId))
    .where(isNotNull(reviews.hiddenAt))
    .orderBy(desc(reviews.hiddenAt), desc(reviews.id))
    .limit(moderationQueueLimit);
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
