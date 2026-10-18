import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  activities,
  follows,
  games,
  lists,
  logs,
  reviews,
  users,
} from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;

export class SocialError extends Error {}

const shownName = sql<string>`coalesce(${users.displayUsername}, ${users.username})`;

// Follows are one-way, like Letterboxd. Following someone twice changes
// nothing; following yourself is refused (the schema forbids it too).
export async function follow(
  db: Database,
  followerId: string,
  followeeId: string,
) {
  if (followerId === followeeId) {
    throw new SocialError("You can't follow yourself.");
  }
  const [followee] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, followeeId));
  if (!followee) throw new SocialError("That player doesn't exist.");
  await db
    .insert(follows)
    .values({ followerId, followeeId })
    .onConflictDoNothing();
}

export async function unfollow(
  db: Database,
  followerId: string,
  followeeId: string,
) {
  await db
    .delete(follows)
    .where(
      and(
        eq(follows.followerId, followerId),
        eq(follows.followeeId, followeeId),
      ),
    );
}

export async function getFollowState(
  db: Database,
  userId: string,
  viewerId: string | null,
) {
  const [[followers], [following], viewerFollows] = await Promise.all([
    db
      .select({ n: count() })
      .from(follows)
      .where(eq(follows.followeeId, userId)),
    db
      .select({ n: count() })
      .from(follows)
      .where(eq(follows.followerId, userId)),
    viewerId
      ? db
          .select({ id: follows.followeeId })
          .from(follows)
          .where(
            and(
              eq(follows.followerId, viewerId),
              eq(follows.followeeId, userId),
            ),
          )
      : Promise.resolve([]),
  ]);
  return {
    followers: followers.n,
    following: following.n,
    viewerFollows: viewerFollows.length > 0,
  };
}

export const playerSearchLimit = 20;

// Players whose username or display name starts with the query.
export async function searchPlayers(db: Database, query: string) {
  const prefix = `${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .select({ username: shownName, displayName: users.displayName })
    .from(users)
    .where(or(ilike(users.username, prefix), ilike(users.displayName, prefix)))
    .orderBy(asc(users.username))
    .limit(playerSearchLimit);
}

export const feedPageSize = 30;

const reviewLog = alias(logs, "review_log");

// One page of activity from the players the viewer follows, newest first.
// Activities point at their object polymorphically, so each kind is joined
// on its own; ones whose object is gone, hidden or private are left out. A
// play logged with a review shows once, as the review.
export async function getFeed(db: Database, viewerId: string, page = 1) {
  const followees = db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(eq(follows.followerId, viewerId));
  const rows = await db
    .select({
      id: activities.id,
      verb: activities.verb,
      createdAt: activities.createdAt,
      actor: shownName,
      log: {
        id: logs.id,
        status: logs.status,
        rating: logs.rating,
        hearted: logs.hearted,
        isReplay: logs.isReplay,
      },
      review: {
        id: reviews.id,
        body: reviews.body,
        containsSpoilers: reviews.containsSpoilers,
      },
      // The rating on the reviewed play.
      reviewRating: reviewLog.rating,
      list: { id: lists.id, title: lists.title },
      game: { slug: games.slug, title: games.title, coverUrl: games.coverUrl },
    })
    .from(activities)
    .innerJoin(users, eq(users.id, activities.actorId))
    .leftJoin(
      logs,
      and(eq(activities.objectType, "log"), eq(logs.id, activities.objectId)),
    )
    .leftJoin(
      reviews,
      and(
        eq(activities.objectType, "review"),
        eq(reviews.id, activities.objectId),
        isNull(reviews.hiddenAt),
      ),
    )
    .leftJoin(reviewLog, eq(reviewLog.id, reviews.logId))
    .leftJoin(
      lists,
      and(
        eq(activities.objectType, "list"),
        eq(lists.id, activities.objectId),
        eq(lists.isPublic, true),
      ),
    )
    .leftJoin(
      games,
      eq(games.id, sql`coalesce(${logs.gameId}, ${reviewLog.gameId})`),
    )
    .where(
      and(
        inArray(activities.actorId, followees),
        or(
          and(
            sql`${logs.id} is not null`,
            sql`not exists (select 1 from ${reviews} r where r.log_id = ${logs.id} and r.hidden_at is null)`,
          ),
          sql`${reviews.id} is not null`,
          sql`${lists.id} is not null`,
        ),
      ),
    )
    .orderBy(desc(activities.createdAt), desc(activities.id))
    .limit(feedPageSize + 1)
    .offset((page - 1) * feedPageSize);
  return {
    entries: rows.slice(0, feedPageSize),
    hasMore: rows.length > feedPageSize,
  };
}
