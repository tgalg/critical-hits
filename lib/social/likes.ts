import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { likes, lists, logs, reviews } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type LikeTarget = "review" | "list";

export class LikeError extends Error {}

// The owner of a review or list anyone can see, or null when it is missing,
// hidden or private. The row stays locked until the like is written, so a
// delete that removes the target before its likes can't leave this one
// behind; review locks also serialize like_count changes.
async function visibleTargetOwner(
  tx: Transaction,
  type: LikeTarget,
  id: number,
) {
  if (type === "review") {
    const { rows } = await tx.execute<{ owner: string }>(sql`
      SELECT ${logs.userId} AS owner FROM ${reviews}
      JOIN ${logs} ON ${logs.id} = ${reviews.logId}
      WHERE ${reviews.id} = ${id} AND ${reviews.hiddenAt} IS NULL
      FOR NO KEY UPDATE OF reviews`);
    return rows[0]?.owner ?? null;
  }
  const { rows } = await tx.execute<{ owner: string }>(sql`
    SELECT ${lists.userId} AS owner FROM ${lists}
    WHERE ${lists.id} = ${id} AND ${lists.isPublic}
    FOR KEY SHARE`);
  return rows[0]?.owner ?? null;
}

// Likes or unlikes a review or public list and returns whether the player
// now likes it. Players can't like their own; reviews keep a running
// like_count (maintained by a database trigger), lists are counted on read.
export async function setLike(
  db: Database,
  userId: string,
  type: LikeTarget,
  id: number,
  liked: boolean,
) {
  return db.transaction(async (tx) => {
    const owner = await visibleTargetOwner(tx, type, id);
    if (!owner) throw new LikeError("That doesn't exist.");
    if (owner === userId) throw new LikeError("You can't like your own.");
    const target = and(
      eq(likes.userId, userId),
      eq(likes.targetType, type),
      eq(likes.targetId, id),
    );
    // A trigger keeps reviews.like_count in step (drizzle/0003).
    if (liked) {
      await tx
        .insert(likes)
        .values({ userId, targetType: type, targetId: id })
        .onConflictDoNothing();
    } else {
      await tx.delete(likes).where(target);
    }
    return liked;
  });
}

// Which of these targets the viewer likes.
export async function getLikedIds(
  db: Database,
  userId: string | null,
  type: LikeTarget,
  ids: number[],
) {
  if (!userId || ids.length === 0) return new Set<number>();
  const rows = await db
    .select({ id: likes.targetId })
    .from(likes)
    .where(
      and(
        eq(likes.userId, userId),
        eq(likes.targetType, type),
        inArray(likes.targetId, ids),
      ),
    );
  return new Set(rows.map((row) => row.id));
}

export async function getListLikeCount(db: Database, listId: number) {
  const [row] = await db
    .select({ n: count() })
    .from(likes)
    .where(and(eq(likes.targetType, "list"), eq(likes.targetId, listId)));
  return row.n;
}

export async function getReviewLikeCount(db: Database, reviewId: number) {
  const [row] = await db
    .select({ n: reviews.likeCount })
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), isNull(reviews.hiddenAt)));
  return row?.n ?? 0;
}
