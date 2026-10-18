import { and, desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  activities,
  backlogItems,
  gamePlatforms,
  games,
  logs,
  platforms,
} from "@/lib/db/schema";
import type { LogInput } from "@/lib/logs/input";

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
  const [link] = await tx
    .select({ platformId: gamePlatforms.platformId })
    .from(gamePlatforms)
    .where(
      and(
        eq(gamePlatforms.gameId, gameId),
        eq(gamePlatforms.platformId, platformId),
      ),
    )
    .limit(1);
  if (!link) throw new LogError("That platform isn't available for this game.");
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

export async function createLog(
  db: Database,
  userId: string,
  gameId: number,
  input: LogInput,
) {
  return db.transaction(async (tx) => {
    await lockGame(tx, gameId);
    await checkPlatform(tx, gameId, input.platformId);
    const [log] = await tx
      .insert(logs)
      .values({ ...input, userId, gameId })
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
    await tx
      .update(logs)
      .set(input)
      .where(and(eq(logs.id, logId), eq(logs.userId, userId)));
    await recomputeGameRating(tx, gameId);
    return gameId;
  });
}

export async function deleteLog(db: Database, userId: string, logId: number) {
  return db.transaction(async (tx) => {
    const { gameId } = await ownedLog(tx, userId, logId);
    await lockGame(tx, gameId);
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

export type LogRow = Awaited<ReturnType<typeof getUserLogsForGame>>[number];

export async function getUserLogsForGame(
  db: Database,
  userId: string,
  gameId: number,
) {
  return db
    .select(logColumns)
    .from(logs)
    .leftJoin(platforms, eq(platforms.id, logs.platformId))
    .where(and(eq(logs.userId, userId), eq(logs.gameId, gameId)))
    .orderBy(desc(logs.createdAt), desc(logs.id));
}

// The diary orders plays by the day they happened: the finish date, else the
// start date, else the day the log was written.
const diaryDate = sql<string>`coalesce(${logs.finishedOn}, ${logs.startedOn}, (${logs.createdAt} AT TIME ZONE 'UTC')::date)::text`;

export async function getDiary(db: Database, userId: string, limit = 200) {
  return db
    .select({
      ...logColumns,
      diaryDate,
      game: { slug: games.slug, title: games.title, coverUrl: games.coverUrl },
    })
    .from(logs)
    .innerJoin(games, eq(games.id, logs.gameId))
    .leftJoin(platforms, eq(platforms.id, logs.platformId))
    .where(eq(logs.userId, userId))
    .orderBy(desc(diaryDate), desc(logs.createdAt), desc(logs.id))
    .limit(limit);
}

export async function getOwnedLog(db: Database, userId: string, logId: number) {
  const [log] = await db
    .select({
      ...logColumns,
      gameId: logs.gameId,
      game: { slug: games.slug, title: games.title },
    })
    .from(logs)
    .innerJoin(games, eq(games.id, logs.gameId))
    .leftJoin(platforms, eq(platforms.id, logs.platformId))
    .where(and(eq(logs.id, logId), eq(logs.userId, userId)))
    .limit(1);
  return log ?? null;
}
