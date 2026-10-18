import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { upsertCatalogGames } from "@/lib/catalog/sync";
import { games, likes, reviews, users } from "@/lib/db/schema";
import { createList, deleteList, updateList } from "@/lib/lists/service";
import type { LogInput } from "@/lib/logs/input";
import { createLog, deleteLog } from "@/lib/logs/service";
import {
  getLikedIds,
  getListLikeCount,
  getReviewLikeCount,
  LikeError,
  setLike,
} from "@/lib/social/likes";
import {
  hasTestDatabase,
  openTestDatabase,
  resetTestDatabase,
} from "@/lib/test-database";

const reviewed = (body: string): LogInput => ({
  status: "finished",
  platformId: null,
  startedOn: null,
  finishedOn: null,
  hours: null,
  rating: 8,
  hearted: false,
  isReplay: false,
  review: { body, containsSpoilers: false },
});

const list = (isPublic = true) => ({
  title: "Picks",
  description: null,
  isRanked: false,
  isPublic,
});

describe.skipIf(!hasTestDatabase)("likes", () => {
  const { pool, db } = openTestDatabase();
  const players = ["ana", "ben", "cy", "dee", "eli"];
  let hades: number;

  beforeAll(async () => {
    await resetTestDatabase(pool, db);
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE users, games, platforms, activities, likes RESTART IDENTITY CASCADE",
    );
    await db
      .insert(users)
      .values(
        players.map((id) => ({ id, email: `${id}@example.com`, username: id })),
      );
    await upsertCatalogGames(db, [
      {
        igdbId: 1,
        slug: "hades",
        title: "Hades",
        coverUrl: null,
        releaseDate: null,
        summary: null,
        platforms: [],
      },
    ]);
    [{ id: hades }] = await db.select({ id: games.id }).from(games);
  });

  afterAll(async () => {
    await pool.end();
  });

  const reviewId = async (logId: number) =>
    (
      await db
        .select({ id: reviews.id })
        .from(reviews)
        .where(eq(reviews.logId, logId))
    )[0].id;

  it("likes and unlikes a review, keeping its count", async () => {
    const id = await reviewId(
      await createLog(db, "ana", hades, reviewed("Yes.")),
    );
    await setLike(db, "ben", "review", id, true);
    await setLike(db, "ben", "review", id, true);
    await setLike(db, "cy", "review", id, true);
    expect(await getReviewLikeCount(db, id)).toBe(2);
    expect(await getLikedIds(db, "ben", "review", [id, 999])).toEqual(
      new Set([id]),
    );
    expect(await getLikedIds(db, null, "review", [id])).toEqual(new Set());
    await setLike(db, "ben", "review", id, false);
    await setLike(db, "ben", "review", id, false);
    expect(await getReviewLikeCount(db, id)).toBe(1);
  });

  it("counts likes that arrive at once", async () => {
    const id = await reviewId(
      await createLog(db, "ana", hades, reviewed("Yes.")),
    );
    await Promise.all(
      players.slice(1).map((player) => setLike(db, player, "review", id, true)),
    );
    expect(await getReviewLikeCount(db, id)).toBe(4);
    expect(await db.$count(likes)).toBe(4);
  });

  it("refuses own, hidden, private and missing targets", async () => {
    const id = await reviewId(
      await createLog(db, "ana", hades, reviewed("Yes.")),
    );
    await expect(setLike(db, "ana", "review", id, true)).rejects.toThrow(
      "You can't like your own.",
    );
    await db
      .update(reviews)
      .set({ hiddenAt: sql`now()` })
      .where(eq(reviews.id, id));
    await expect(setLike(db, "ben", "review", id, true)).rejects.toThrow(
      LikeError,
    );
    const secret = await createList(db, "ana", list(false));
    await expect(setLike(db, "ben", "list", secret, true)).rejects.toThrow(
      LikeError,
    );
    await updateList(db, "ana", secret, list(true));
    await setLike(db, "ben", "list", secret, true);
    expect(await getListLikeCount(db, secret)).toBe(1);
    await expect(setLike(db, "ben", "list", 999_999, true)).rejects.toThrow(
      LikeError,
    );
  });

  it("removes likes with the review or list they were on", async () => {
    const logId = await createLog(db, "ana", hades, reviewed("Yes."));
    await setLike(db, "ben", "review", await reviewId(logId), true);
    const picks = await createList(db, "ana", list());
    await setLike(db, "ben", "list", picks, true);
    await deleteLog(db, "ana", logId);
    await deleteList(db, "ana", picks);
    expect(await db.$count(likes)).toBe(0);
  });

  it("never leaves a like behind when liking and deleting race", async () => {
    for (let round = 0; round < 10; round++) {
      const logId = await createLog(db, "ana", hades, reviewed("Yes."));
      const id = await reviewId(logId);
      const picks = await createList(db, "ana", list());
      await Promise.allSettled([
        setLike(db, "ben", "review", id, true),
        deleteLog(db, "ana", logId),
        setLike(db, "ben", "list", picks, true),
        deleteList(db, "ana", picks),
      ]);
      expect(await db.$count(likes)).toBe(0);
    }
  });
});
