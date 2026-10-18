import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  activities,
  backlogItems,
  games,
  likes,
  logs,
  platforms,
  reviews,
  users,
} from "@/lib/db/schema";
import { gameHasPlatform } from "@/lib/catalog/queries";
import type { LogInput, ReviewInput } from "@/lib/logs/input";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class LogError extends Error {}

// Locks the game row so concurrent log writes for one game run their rating
// recomputes one after another; without it, two writers could each miss the
// other's uncommitted rating and leave a stale average.
async function lockGame(tx: Transaction, gameId: number) {
  const { rows } = await tx.execute<{ id: number }>(
    sql`SELECT id FROM games WHERE id = ${gameId} FOR UPDATE`,
  );
  if (rows.length === 0) throw new LogError("That game doesn't exist.");
}

async function checkPlatform(
  tx: Transaction,
  gameId: number,
  platformId: number | null,
) {
  if (platformId === null) return;
  if (!(await gameHasPlatform(tx, gameId, platformId))) {
    throw new LogError("That platform isn't available for this game.");
  }
}

// A game's average counts each player once, using their most recent rated
// log, so replays update a player's opinion instead of adding a vote.
export async function recomputeGameRating(
  db: Database | Transaction,
  gameId: number,
) {
  await db.execute(sql`
    UPDATE games
    SET avg_rating = latest.avg, rating_count = latest.n
    FROM (
      SELECT round(avg(rating), 2) AS avg, count(*)::int AS n
      FROM (
        SELECT DISTINCT ON (user_id) rating
        FROM logs
        WHERE game_id = ${gameId} AND rating IS NOT NULL
        ORDER BY user_id, created_at DESC, id DESC
      ) per_player
    ) latest
    WHERE games.id = ${gameId}
  `);
}

// Likes and activities point at a review polymorphically, with no foreign
// key, so they are removed by hand. The review goes first: a like being
// written holds a lock on it, so this waits for that like and then sees it.
async function deleteReview(tx: Transaction, reviewId: number) {
  await tx.delete(reviews).where(eq(reviews.id, reviewId));
  await tx
    .delete(likes)
    .where(and(eq(likes.targetType, "review"), eq(likes.targetId, reviewId)));
  await tx
    .delete(activities)
    .where(
      and(
        eq(activities.objectType, "review"),
        eq(activities.objectId, reviewId),
      ),
    );
}

// Makes the log's review match the form: creates it (with a `reviewed`
// activity), updates it, or deletes it when the text was cleared.
async function saveReview(
  tx: Transaction,
  userId: string,
  logId: number,
  input: ReviewInput | null,
) {
  const [existing] = await tx
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.logId, logId));
  if (!input) {
    if (existing) await deleteReview(tx, existing.id);
    return;
  }
  if (existing) {
    await tx.update(reviews).set(input).where(eq(reviews.id, existing.id));
    return;
  }
  const [review] = await tx
    .insert(reviews)
    .values({ ...input, logId })
    .returning({ id: reviews.id });
  await tx.insert(activities).values({
    actorId: userId,
    verb: "reviewed",
    objectType: "review",
    objectId: review.id,
  });
}

export async function createLog(
  db: Database,
  userId: string,
  gameId: number,
  input: LogInput,
) {
  return db.transaction(async (tx) => {
    await lockGame(tx, gameId);
    await checkPlatform(tx, gameId, input.platformId);
    const { review, ...fields } = input;
    const [log] = await tx
      .insert(logs)
      .values({ ...fields, userId, gameId })
      .returning({ id: logs.id });
    await tx.insert(activities).values({
      actorId: userId,
      verb: "logged",
      objectType: "log",
      objectId: log.id,
    });
    // Logging a game takes it off the player's backlog.
    await tx
      .delete(backlogItems)
      .where(
        and(eq(backlogItems.userId, userId), eq(backlogItems.gameId, gameId)),
      );
    await saveReview(tx, userId, log.id, review);
    await recomputeGameRating(tx, gameId);
    return log.id;
  });
}

// Finds a log only if it belongs to the user, so other players' log ids
// behave exactly like missing ones.
async function ownedLog(tx: Transaction, userId: string, logId: number) {
  const [log] = await tx
    .select({ id: logs.id, gameId: logs.gameId })
    .from(logs)
    .where(and(eq(logs.id, logId), eq(logs.userId, userId)))
    .limit(1);
  if (!log) throw new LogError("That log doesn't exist.");
  return log;
}

export async function updateLog(
  db: Database,
  userId: string,
  logId: number,
  input: LogInput,
) {
  return db.transaction(async (tx) => {
    const { gameId } = await ownedLog(tx, userId, logId);
    await lockGame(tx, gameId);
    await checkPlatform(tx, gameId, input.platformId);
    const { review, ...fields } = input;
    await tx
      .update(logs)
      .set(fields)
      .where(and(eq(logs.id, logId), eq(logs.userId, userId)));
    await saveReview(tx, userId, logId, review);
    await recomputeGameRating(tx, gameId);
    return gameId;
  });
}

export async function deleteLog(db: Database, userId: string, logId: number) {
  return db.transaction(async (tx) => {
    const { gameId } = await ownedLog(tx, userId, logId);
    await lockGame(tx, gameId);
    const [review] = await tx
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.logId, logId));
    if (review) await deleteReview(tx, review.id);
    await tx
      .delete(logs)
      .where(and(eq(logs.id, logId), eq(logs.userId, userId)));
    await tx
      .delete(activities)
      .where(
        and(eq(activities.objectType, "log"), eq(activities.objectId, logId)),
      );
    await recomputeGameRating(tx, gameId);
    return gameId;
  });
}

const logColumns = {
  id: logs.id,
  status: logs.status,
  platformId: logs.platformId,
  platform: platforms.name,
  startedOn: logs.startedOn,
  finishedOn: logs.finishedOn,
  hours: logs.hours,
  rating: logs.rating,
  hearted: logs.hearted,
  isReplay: logs.isReplay,
  createdAt: logs.createdAt,
};

// The log's review, if it has one; reviews are one per log.
const reviewColumns = {
  body: reviews.body,
  containsSpoilers: reviews.containsSpoilers,
};

export type LogRow = Awaited<ReturnType<typeof getUserLogsForGame>>[number];

export async function getUserLogsForGame(
  db: Database,
  userId: string,
  gameId: number,
) {
  return db
    .select({ ...logColumns, reviewId: reviews.id })
    .from(logs)
    .leftJoin(platforms, eq(platforms.id, logs.platformId))
    .leftJoin(reviews, eq(reviews.logId, logs.id))
    .where(and(eq(logs.userId, userId), eq(logs.gameId, gameId)))
    .orderBy(desc(logs.createdAt), desc(logs.id));
}

// The diary orders plays by the day they happened: the finish date, else the
// start date, else the day the log was written.
const diaryDate = sql<string>`coalesce(${logs.finishedOn}, ${logs.startedOn}, (${logs.createdAt} AT TIME ZONE 'UTC')::date)::text`;

export const diaryPageSize = 50;

// One page of the diary, plus whether older entries remain.
export async function getDiary(db: Database, userId: string, page = 1) {
  const rows = await db
    .select({
      ...logColumns,
      diaryDate,
      reviewId: reviews.id,
      game: { slug: games.slug, title: games.title, coverUrl: games.coverUrl },
    })
    .from(logs)
    .innerJoin(games, eq(games.id, logs.gameId))
    .leftJoin(platforms, eq(platforms.id, logs.platformId))
    .leftJoin(reviews, eq(reviews.logId, logs.id))
    .where(eq(logs.userId, userId))
    .orderBy(desc(diaryDate), desc(logs.createdAt), desc(logs.id))
    .limit(diaryPageSize + 1)
    .offset((page - 1) * diaryPageSize);
  return {
    entries: rows.slice(0, diaryPageSize),
    hasMore: rows.length > diaryPageSize,
  };
}

export async function getOwnedLog(db: Database, userId: string, logId: number) {
  const [log] = await db
    .select({
      ...logColumns,
      gameId: logs.gameId,
      game: { slug: games.slug, title: games.title },
      review: reviewColumns,
    })
    .from(logs)
    .innerJoin(games, eq(games.id, logs.gameId))
    .leftJoin(platforms, eq(platforms.id, logs.platformId))
    .leftJoin(reviews, eq(reviews.logId, logs.id))
    .where(and(eq(logs.id, logId), eq(logs.userId, userId)))
    .limit(1);
  return log ?? null;
}

export const gameReviewsLimit = 20;

// The newest visible reviews of a game from every player, with the rating
// given on the reviewed play.
export async function getGameReviews(db: Database, gameId: number) {
  return db
    .select({
      id: reviews.id,
      ...reviewColumns,
      createdAt: reviews.createdAt,
      rating: logs.rating,
      likeCount: reviews.likeCount,
      authorId: logs.userId,
      author: sql<string>`coalesce(${users.displayUsername}, ${users.username})`,
    })
    .from(reviews)
    .innerJoin(logs, eq(logs.id, reviews.logId))
    .innerJoin(users, eq(users.id, logs.userId))
    .where(and(eq(logs.gameId, gameId), isNull(reviews.hiddenAt)))
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(gameReviewsLimit);
}
