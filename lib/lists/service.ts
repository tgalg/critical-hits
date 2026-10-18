import { and, asc, count, desc, eq, gt, lt, max, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  activities,
  games,
  likes,
  listItems,
  lists,
  users,
} from "@/lib/db/schema";
import type { ListInput } from "@/lib/lists/input";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class ListError extends Error {}

// Every change to a list runs under a lock on its row, taken only if the
// player owns it, so other players' list ids behave like missing ones and two
// tabs can't hand out the same position. NO KEY UPDATE doesn't block the
// key-share locks that list_items inserts take on the list.
async function lockList(tx: Transaction, userId: string, listId: number) {
  const { rows } = await tx.execute<{ id: number }>(
    sql`SELECT id FROM lists WHERE id = ${listId} AND user_id = ${userId} FOR NO KEY UPDATE`,
  );
  if (rows.length === 0) throw new ListError("That list doesn't exist.");
}

export async function createList(
  db: Database,
  userId: string,
  input: ListInput,
) {
  return db.transaction(async (tx) => {
    const [list] = await tx
      .insert(lists)
      .values({ ...input, userId })
      .returning({ id: lists.id });
    await tx.insert(activities).values({
      actorId: userId,
      verb: "created_list",
      objectType: "list",
      objectId: list.id,
    });
    return list.id;
  });
}

export async function updateList(
  db: Database,
  userId: string,
  listId: number,
  input: ListInput,
) {
  await db.transaction(async (tx) => {
    await lockList(tx, userId, listId);
    await tx.update(lists).set(input).where(eq(lists.id, listId));
  });
}

export async function deleteList(db: Database, userId: string, listId: number) {
  await db.transaction(async (tx) => {
    await lockList(tx, userId, listId);
    // Items go with the list through the foreign key, but likes and
    // activities point at it polymorphically, so remove those by hand.
    await tx
      .delete(likes)
      .where(and(eq(likes.targetType, "list"), eq(likes.targetId, listId)));
    await tx
      .delete(activities)
      .where(
        and(eq(activities.objectType, "list"), eq(activities.objectId, listId)),
      );
    await tx.delete(lists).where(eq(lists.id, listId));
  });
}

// Adds a game to the end of the list. Adding a game that is already there
// changes nothing and returns false.
export async function addToList(
  db: Database,
  userId: string,
  listId: number,
  gameId: number,
) {
  return db.transaction(async (tx) => {
    await lockList(tx, userId, listId);
    const [game] = await tx
      .select({ id: games.id })
      .from(games)
      .where(eq(games.id, gameId));
    if (!game) throw new ListError("That game doesn't exist.");
    const [last] = await tx
      .select({ position: max(listItems.position) })
      .from(listItems)
      .where(eq(listItems.listId, listId));
    const added = await tx
      .insert(listItems)
      .values({ listId, gameId, position: (last?.position ?? 0) + 1 })
      .onConflictDoNothing()
      .returning({ gameId: listItems.gameId });
    return added.length > 0;
  });
}

export async function removeFromList(
  db: Database,
  userId: string,
  listId: number,
  gameId: number,
) {
  await db.transaction(async (tx) => {
    await lockList(tx, userId, listId);
    await tx
      .delete(listItems)
      .where(and(eq(listItems.listId, listId), eq(listItems.gameId, gameId)));
  });
}

export async function setListItemNote(
  db: Database,
  userId: string,
  listId: number,
  gameId: number,
  note: string | null,
) {
  await db.transaction(async (tx) => {
    await lockList(tx, userId, listId);
    await tx
      .update(listItems)
      .set({ note })
      .where(and(eq(listItems.listId, listId), eq(listItems.gameId, gameId)));
  });
}

// Swaps a game with its neighbour above ("up") or below ("down"). Moving the
// first game up or the last one down does nothing.
export async function moveListItem(
  db: Database,
  userId: string,
  listId: number,
  gameId: number,
  direction: "up" | "down",
) {
  await db.transaction(async (tx) => {
    await lockList(tx, userId, listId);
    const onList = eq(listItems.listId, listId);
    const [item] = await tx
      .select({ position: listItems.position })
      .from(listItems)
      .where(and(onList, eq(listItems.gameId, gameId)));
    if (!item) return;
    const [neighbour] = await tx
      .select({ gameId: listItems.gameId, position: listItems.position })
      .from(listItems)
      .where(
        and(
          onList,
          direction === "up"
            ? lt(listItems.position, item.position)
            : gt(listItems.position, item.position),
        ),
      )
      .orderBy(
        direction === "up" ? desc(listItems.position) : asc(listItems.position),
      )
      .limit(1);
    if (!neighbour) return;
    await tx
      .update(listItems)
      .set({ position: neighbour.position })
      .where(and(onList, eq(listItems.gameId, gameId)));
    await tx
      .update(listItems)
      .set({ position: item.position })
      .where(and(onList, eq(listItems.gameId, neighbour.gameId)));
  });
}

// The player's own lists, newest first, with how many games each holds.
export async function getUserLists(db: Database, userId: string) {
  return db
    .select({
      id: lists.id,
      title: lists.title,
      isPublic: lists.isPublic,
      isRanked: lists.isRanked,
      gameCount: count(listItems.gameId),
    })
    .from(lists)
    .leftJoin(listItems, eq(listItems.listId, lists.id))
    .where(eq(lists.userId, userId))
    .groupBy(lists.id)
    .orderBy(desc(lists.createdAt), desc(lists.id));
}

// A list and its games in order. A private list is visible only to its
// owner; for anyone else it behaves like a missing one.
export async function getList(
  db: Database,
  listId: number,
  viewerId: string | null,
) {
  const [list] = await db
    .select({
      id: lists.id,
      userId: lists.userId,
      title: lists.title,
      description: lists.description,
      isRanked: lists.isRanked,
      isPublic: lists.isPublic,
      owner: sql<string>`coalesce(${users.displayUsername}, ${users.username})`,
    })
    .from(lists)
    .innerJoin(users, eq(users.id, lists.userId))
    .where(eq(lists.id, listId));
  if (!list || (!list.isPublic && list.userId !== viewerId)) return null;
  const items = await db
    .select({
      gameId: listItems.gameId,
      note: listItems.note,
      game: { slug: games.slug, title: games.title, coverUrl: games.coverUrl },
    })
    .from(listItems)
    .innerJoin(games, eq(games.id, listItems.gameId))
    .where(eq(listItems.listId, listId))
    .orderBy(asc(listItems.position));
  return { ...list, items };
}
