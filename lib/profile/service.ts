import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  backlogItems,
  games,
  listItems,
  lists,
  logs,
  platforms,
  reviews,
  users,
} from "@/lib/db/schema";
import type { ProfileInput } from "@/lib/profile/input";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;

export class ProfileError extends Error {}

export const maxFavourites = 4;

// Postgres reports a unique violation as 23505; Drizzle wraps the driver's
// error in `cause`.
function isUniqueViolation(error: unknown) {
  const code = (value: unknown) =>
    typeof value === "object" && value !== null && "code" in value
      ? value.code
      : undefined;
  return (
    code(error) === "23505" ||
    code((error as { cause?: unknown } | null)?.cause) === "23505"
  );
}

// Usernames are stored lowercase with the typed casing kept for display, as
// Better Auth's username plugin does at sign-up.
export async function updateProfile(
  db: Database,
  userId: string,
  input: ProfileInput,
) {
  try {
    await db
      .update(users)
      .set({
        username: input.username.toLowerCase(),
        displayUsername: input.username,
        displayName: input.displayName,
        bio: input.bio,
        backlogPublic: input.backlogPublic,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ProfileError("That username is taken.");
    }
    throw error;
  }
}

// Adds the game to the player's favourite four, or removes it if it is
// already there. The user row lock keeps two tabs from both adding a fifth.
export async function toggleFavourite(
  db: Database,
  userId: string,
  gameId: number,
) {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ favourite_game_ids: number[] }>(
      sql`SELECT favourite_game_ids FROM users WHERE id = ${userId} FOR NO KEY UPDATE`,
    );
    const current = rows[0]?.favourite_game_ids ?? [];
    let next: number[];
    if (current.includes(gameId)) {
      next = current.filter((id) => id !== gameId);
    } else {
      if (current.length >= maxFavourites) {
        throw new ProfileError(
          "You already have four favourites. Remove one first.",
        );
      }
      const [game] = await tx
        .select({ id: games.id })
        .from(games)
        .where(eq(games.id, gameId));
      if (!game) throw new ProfileError("That game doesn't exist.");
      next = [...current, gameId];
    }
    await tx
      .update(users)
      .set({ favouriteGameIds: next })
      .where(eq(users.id, userId));
    return next.includes(gameId);
  });
}

export async function getFavouriteIds(db: Database, userId: string) {
  const [row] = await db
    .select({ ids: users.favouriteGameIds })
    .from(users)
    .where(eq(users.id, userId));
  return row?.ids ?? [];
}

export const profileRecentLimit = 10;

// Everything the public profile shows, or null for an unknown username.
// Private lists are left out, and a private backlog (null here) is shown only
// to its owner; the rest of a player's activity is public.
export async function getProfile(
  db: Database,
  username: string,
  year: number,
  viewerId: string | null = null,
) {
  const [user] = await db
    .select({
      id: users.id,
      username: sql<string>`coalesce(${users.displayUsername}, ${users.username})`,
      displayName: users.displayName,
      bio: users.bio,
      favouriteGameIds: users.favouriteGameIds,
      backlogPublic: users.backlogPublic,
    })
    .from(users)
    .where(eq(sql`lower(${users.username})`, username.toLowerCase()));
  if (!user) return null;
  const showBacklog = user.backlogPublic || viewerId === user.id;

  const mine = eq(logs.userId, user.id);
  const finishedThisYear = sql<number>`count(*) filter (where ${logs.status} = 'finished' and extract(year from coalesce(${logs.finishedOn}, (${logs.createdAt} AT TIME ZONE 'UTC')::date)) = ${year})::int`;
  const [
    favouriteRows,
    [stats],
    recentLogs,
    recentReviews,
    publicLists,
    backlog,
    [backlogTotal],
  ] = await Promise.all([
    user.favouriteGameIds.length
      ? db
          .select({
            id: games.id,
            slug: games.slug,
            title: games.title,
            coverUrl: games.coverUrl,
          })
          .from(games)
          .where(inArray(games.id, user.favouriteGameIds))
      : Promise.resolve([]),
    db
      .select({
        gamesPlayed: sql<number>`count(distinct ${logs.gameId})::int`,
        finishedThisYear,
        hours: sql<string>`coalesce(sum(${logs.hours}), 0)::text`,
        reviews: sql<number>`count(${reviews.id})::int`,
      })
      .from(logs)
      .leftJoin(
        reviews,
        and(eq(reviews.logId, logs.id), isNull(reviews.hiddenAt)),
      )
      .where(mine),
    db
      .select({
        id: logs.id,
        status: logs.status,
        rating: logs.rating,
        hearted: logs.hearted,
        isReplay: logs.isReplay,
        platform: platforms.name,
        startedOn: logs.startedOn,
        finishedOn: logs.finishedOn,
        hours: logs.hours,
        game: {
          slug: games.slug,
          title: games.title,
          coverUrl: games.coverUrl,
        },
      })
      .from(logs)
      .innerJoin(games, eq(games.id, logs.gameId))
      .leftJoin(platforms, eq(platforms.id, logs.platformId))
      .where(mine)
      .orderBy(desc(logs.createdAt), desc(logs.id))
      .limit(profileRecentLimit),
    db
      .select({
        id: reviews.id,
        body: reviews.body,
        containsSpoilers: reviews.containsSpoilers,
        createdAt: reviews.createdAt,
        rating: logs.rating,
        likeCount: reviews.likeCount,
        game: { slug: games.slug, title: games.title },
      })
      .from(reviews)
      .innerJoin(logs, eq(logs.id, reviews.logId))
      .innerJoin(games, eq(games.id, logs.gameId))
      .where(and(mine, isNull(reviews.hiddenAt)))
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(5),
    db
      .select({
        id: lists.id,
        title: lists.title,
        gameCount: count(listItems.gameId),
      })
      .from(lists)
      .leftJoin(listItems, eq(listItems.listId, lists.id))
      .where(and(eq(lists.userId, user.id), eq(lists.isPublic, true)))
      .groupBy(lists.id)
      .orderBy(desc(lists.createdAt), desc(lists.id)),
    showBacklog &&
      db
        .select({
          gameId: backlogItems.gameId,
          game: {
            slug: games.slug,
            title: games.title,
            coverUrl: games.coverUrl,
          },
        })
        .from(backlogItems)
        .innerJoin(games, eq(games.id, backlogItems.gameId))
        .where(eq(backlogItems.userId, user.id))
        .orderBy(asc(backlogItems.position))
        .limit(profileRecentLimit),
    showBacklog
      ? db
          .select({ total: count() })
          .from(backlogItems)
          .where(eq(backlogItems.userId, user.id))
      : [null],
  ]);

  // Keep the order the player picked their favourites in.
  const favourites = user.favouriteGameIds
    .map((id) => favouriteRows.find((game) => game.id === id))
    .filter((game) => game !== undefined);

  return {
    user,
    favourites,
    stats: {
      ...stats,
      backlog: backlogTotal?.total ?? null,
      lists: publicLists.length,
    },
    recentLogs,
    recentReviews: recentReviews.map((review) => ({
      ...review,
      author: user.username,
    })),
    lists: publicLists,
    backlog: backlog || null,
  };
}

// The fields the account page lets a player edit.
export async function getAccount(db: Database, userId: string) {
  const [row] = await db
    .select({
      username: sql<string>`coalesce(${users.displayUsername}, ${users.username})`,
      displayName: users.displayName,
      bio: users.bio,
      backlogPublic: users.backlogPublic,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}
