import { and, asc, desc, eq, gt, lt, max, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { gameHasPlatform } from "@/lib/catalog/queries";
import { backlogItems, games, platforms } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class BacklogError extends Error {}

// Every backlog change for a player runs under a lock on their user row, so
// two tabs adding or moving at once can't hand out the same position.
async function lockPlayer(tx: Transaction, userId: string) {
  await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
}

// Adds a game to the end of the player's backlog. Adding a game that is
// already there changes nothing and returns false.
export async function addToBacklog(
  db: Database,
  userId: string,
  gameId: number,
  platformId: number | null,
) {
  return db.transaction(async (tx) => {
    await lockPlayer(tx, userId);
    const [game] = await tx
      .select({ id: games.id })
      .from(games)
      .where(eq(games.id, gameId));
    if (!game) throw new BacklogError("That game doesn't exist.");
    if (
      platformId !== null &&
      !(await gameHasPlatform(tx, gameId, platformId))
    ) {
      throw new BacklogError("That platform isn't available for this game.");
    }
    const [last] = await tx
      .select({ position: max(backlogItems.position) })
      .from(backlogItems)
      .where(eq(backlogItems.userId, userId));
    const added = await tx
      .insert(backlogItems)
      .values({
        userId,
        gameId,
        platformId,
        position: (last?.position ?? 0) + 1,
      })
      .onConflictDoNothing()
      .returning({ gameId: backlogItems.gameId });
    return added.length > 0;
  });
}

export async function removeFromBacklog(
  db: Database,
  userId: string,
  gameId: number,
) {
  await db
    .delete(backlogItems)
    .where(
      and(eq(backlogItems.userId, userId), eq(backlogItems.gameId, gameId)),
    );
}

// Swaps a game with its neighbour above ("up") or below ("down"). Moving the
// first game up or the last one down does nothing.
export async function moveBacklogItem(
  db: Database,
  userId: string,
  gameId: number,
  direction: "up" | "down",
) {
  await db.transaction(async (tx) => {
    await lockPlayer(tx, userId);
    const mine = eq(backlogItems.userId, userId);
    const [item] = await tx
      .select({ position: backlogItems.position })
      .from(backlogItems)
      .where(and(mine, eq(backlogItems.gameId, gameId)));
    if (!item) return;
    const [neighbour] = await tx
      .select({
        gameId: backlogItems.gameId,
        position: backlogItems.position,
      })
      .from(backlogItems)
      .where(
        and(
          mine,
          direction === "up"
            ? lt(backlogItems.position, item.position)
            : gt(backlogItems.position, item.position),
        ),
      )
      .orderBy(
        direction === "up"
          ? desc(backlogItems.position)
          : asc(backlogItems.position),
      )
      .limit(1);
    if (!neighbour) return;
    await tx
      .update(backlogItems)
      .set({ position: neighbour.position })
      .where(and(mine, eq(backlogItems.gameId, gameId)));
    await tx
      .update(backlogItems)
      .set({ position: item.position })
      .where(and(mine, eq(backlogItems.gameId, neighbour.gameId)));
  });
}

// The player's backlog in order, optionally only entries on one platform.
export async function getBacklog(
  db: Database,
  userId: string,
  platformId: number | null = null,
) {
  return db
    .select({
      gameId: backlogItems.gameId,
      position: backlogItems.position,
      platformId: backlogItems.platformId,
      platform: platforms.name,
      addedAt: backlogItems.addedAt,
      game: { slug: games.slug, title: games.title, coverUrl: games.coverUrl },
    })
    .from(backlogItems)
    .innerJoin(games, eq(games.id, backlogItems.gameId))
    .leftJoin(platforms, eq(platforms.id, backlogItems.platformId))
    .where(
      and(
        eq(backlogItems.userId, userId),
        platformId === null
          ? undefined
          : eq(backlogItems.platformId, platformId),
      ),
    )
    .orderBy(asc(backlogItems.position));
}

// The platforms named anywhere in the player's backlog, for the filter.
export async function getBacklogPlatforms(db: Database, userId: string) {
  return db
    .selectDistinct({ id: platforms.id, name: platforms.name })
    .from(backlogItems)
    .innerJoin(platforms, eq(platforms.id, backlogItems.platformId))
    .where(eq(backlogItems.userId, userId))
    .orderBy(asc(platforms.name));
}

export async function getBacklogEntry(
  db: Database,
  userId: string,
  gameId: number,
) {
  const [entry] = await db
    .select({ platform: platforms.name })
    .from(backlogItems)
    .leftJoin(platforms, eq(platforms.id, backlogItems.platformId))
    .where(
      and(eq(backlogItems.userId, userId), eq(backlogItems.gameId, gameId)),
    );
  return entry ?? null;
}
