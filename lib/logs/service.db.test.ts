import { desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { upsertCatalogGames } from "@/lib/catalog/sync";
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
import type { LogInput } from "@/lib/logs/input";
import {
  createLog,
  deleteLog,
  diaryPageSize,
  getDiary,
  getGameReviews,
  getOwnedLog,
  getUserLogsForGame,
  LogError,
  updateLog,
} from "@/lib/logs/service";
import {
  hasTestDatabase,
  openTestDatabase,
  resetTestDatabase,
} from "@/lib/test-database";

const play = (overrides: Partial<LogInput> = {}): LogInput => ({
  status: "finished",
  platformId: null,
  startedOn: null,
  finishedOn: null,
  hours: null,
  rating: null,
  hearted: false,
  isReplay: false,
  review: null,
  ...overrides,
});

describe.skipIf(!hasTestDatabase)("logs", () => {
  const { pool, db } = openTestDatabase();
  let hades: number;
  let celeste: number;
  let pc: number;
  let ps5: number;

  beforeAll(async () => {
    await resetTestDatabase(pool, db);
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE users, games, platforms, activities RESTART IDENTITY CASCADE",
    );
    await db.insert(users).values([
      { id: "ana", email: "ana@example.com", username: "ana" },
      { id: "ben", email: "ben@example.com", username: "ben" },
    ]);
    const platform = (igdbId: number, name: string) => ({
      igdbId,
      name,
      abbreviation: null,
    });
    const game = (igdbId: number, slug: string, title: string) => ({
      igdbId,
      slug,
      title,
      coverUrl: null,
      releaseDate: null,
      summary: null,
    });
    await upsertCatalogGames(db, [
      { ...game(1, "hades", "Hades"), platforms: [platform(6, "PC")] },
      { ...game(2, "celeste", "Celeste"), platforms: [platform(167, "PS5")] },
    ]);
    const ids = async (table: typeof games | typeof platforms) =>
      new Map(
        (
          await db.select({ id: table.id, igdbId: table.igdbId }).from(table)
        ).map((row) => [row.igdbId, row.id]),
      );
    const gameIds = await ids(games);
    const platformIds = await ids(platforms);
    hades = gameIds.get(1)!;
    celeste = gameIds.get(2)!;
    pc = platformIds.get(6)!;
    ps5 = platformIds.get(167)!;
  });

  afterAll(async () => {
    await pool.end();
  });

  const average = async (gameId: number) => {
    const [row] = await db
      .select({ avg: games.avgRating, count: games.ratingCount })
      .from(games)
      .where(eq(games.id, gameId));
    return row;
  };

  it("averages each player's latest rating", async () => {
    await createLog(db, "ana", hades, play({ rating: 6 }));
    expect(await average(hades)).toEqual({ avg: "6.00", count: 1 });

    // Ana's replay replaces her opinion instead of adding a second vote.
    await createLog(db, "ana", hades, play({ rating: 10, isReplay: true }));
    await createLog(db, "ben", hades, play({ rating: 7 }));
    expect(await average(hades)).toEqual({ avg: "8.50", count: 2 });

    // Unrated logs don't count, and a later unrated play keeps the old rating.
    await createLog(db, "ben", hades, play({ status: "playing" }));
    expect(await average(hades)).toEqual({ avg: "8.50", count: 2 });
    expect(await average(celeste)).toEqual({ avg: null, count: 0 });
  });

  it("updates the average when a log is edited or deleted", async () => {
    const id = await createLog(db, "ana", hades, play({ rating: 4 }));
    await updateLog(db, "ana", id, play({ rating: 8, hearted: true }));
    expect(await average(hades)).toEqual({ avg: "8.00", count: 1 });
    await deleteLog(db, "ana", id);
    expect(await average(hades)).toEqual({ avg: null, count: 0 });
  });

  it("stays consistent when players log the same game at once", async () => {
    for (let round = 0; round < 5; round++) {
      await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          createLog(db, i % 2 ? "ana" : "ben", hades, play({ rating: 1 + i })),
        ),
      );
      const latest = await db
        .selectDistinctOn([logs.userId], { rating: logs.rating })
        .from(logs)
        .orderBy(logs.userId, desc(logs.createdAt), desc(logs.id));
      const expected =
        latest.reduce((sum, row) => sum + row.rating!, 0) / latest.length;
      expect(await average(hades)).toEqual({
        avg: expected.toFixed(2),
        count: 2,
      });
    }
  });

  it("only lets players change their own logs", async () => {
    const id = await createLog(db, "ana", hades, play({ rating: 6 }));
    await expect(updateLog(db, "ben", id, play({ rating: 1 }))).rejects.toThrow(
      LogError,
    );
    await expect(deleteLog(db, "ben", id)).rejects.toThrow(LogError);
    expect(await getOwnedLog(db, "ben", id)).toBeNull();
    expect((await getOwnedLog(db, "ana", id))?.rating).toBe(6);
  });

  it("only accepts platforms the game is on", async () => {
    await createLog(db, "ana", hades, play({ platformId: pc }));
    await expect(
      createLog(db, "ana", hades, play({ platformId: ps5 })),
    ).rejects.toThrow("That platform isn't available for this game.");
    await expect(createLog(db, "ana", 999_999, play())).rejects.toThrow(
      LogError,
    );
    const [log] = await getUserLogsForGame(db, "ana", hades);
    expect(log.platform).toBe("PC");
  });

  it("records activity and takes the game off the backlog", async () => {
    await db.insert(backlogItems).values([
      { userId: "ana", gameId: hades, position: 1 },
      { userId: "ana", gameId: celeste, position: 2 },
    ]);
    const id = await createLog(db, "ana", hades, play());
    expect(
      (await db.select().from(backlogItems)).map((item) => item.gameId),
    ).toEqual([celeste]);
    expect(
      await db
        .select({ verb: activities.verb, objectId: activities.objectId })
        .from(activities),
    ).toEqual([{ verb: "logged", objectId: id }]);
    await deleteLog(db, "ana", id);
    expect(await db.$count(activities)).toBe(0);
  });

  it("orders the diary by when each play happened", async () => {
    await createLog(db, "ana", hades, play({ finishedOn: "2026-03-10" }));
    await createLog(
      db,
      "ana",
      celeste,
      play({ status: "playing", startedOn: "2026-05-01" }),
    );
    await createLog(db, "ana", hades, play({ finishedOn: "2025-12-24" }));
    await createLog(db, "ben", celeste, play({ finishedOn: "2026-06-01" }));
    const { entries: diary, hasMore } = await getDiary(db, "ana");
    expect(hasMore).toBe(false);
    expect(diary.map((entry) => [entry.game.title, entry.diaryDate])).toEqual([
      ["Celeste", "2026-05-01"],
      ["Hades", "2026-03-10"],
      ["Hades", "2025-12-24"],
    ]);
  });

  it("pages through a long diary without dropping entries", async () => {
    const total = diaryPageSize * 2 + 3;
    await db.insert(logs).values(
      Array.from({ length: total }, (_, i) => ({
        userId: "ana",
        gameId: hades,
        status: "finished" as const,
        finishedOn: `2026-01-01`,
        hours: String(i),
      })),
    );
    const pages = [];
    for (let page = 1; ; page++) {
      const result = await getDiary(db, "ana", page);
      pages.push(result.entries.length);
      if (!result.hasMore) break;
    }
    expect(pages).toEqual([diaryPageSize, diaryPageSize, 3]);
  });

  it("removes a deleted log's review likes and activity", async () => {
    const id = await createLog(db, "ana", hades, play());
    const [review] = await db
      .insert(reviews)
      .values({ logId: id, body: "Loved it." })
      .returning();
    await db
      .insert(likes)
      .values({ userId: "ben", targetType: "review", targetId: review.id });
    await db.insert(activities).values({
      actorId: "ana",
      verb: "reviewed",
      objectType: "review",
      objectId: review.id,
    });
    await deleteLog(db, "ana", id);
    expect(await db.$count(reviews)).toBe(0);
    expect(await db.$count(likes)).toBe(0);
    expect(await db.$count(activities)).toBe(0);
  });

  const reviewed = (body: string, containsSpoilers = false) =>
    play({ rating: 8, review: { body, containsSpoilers } });

  const reviewActivities = () =>
    db
      .select({ objectId: activities.objectId })
      .from(activities)
      .where(eq(activities.verb, "reviewed"));

  it("writes a review with its log and records it once", async () => {
    const id = await createLog(db, "ana", hades, reviewed("Loved it."));
    const [review] = await db.select().from(reviews);
    expect(review).toMatchObject({
      logId: id,
      body: "Loved it.",
      containsSpoilers: false,
    });
    expect(await reviewActivities()).toEqual([{ objectId: review.id }]);
    expect((await getOwnedLog(db, "ana", id))?.review).toEqual({
      body: "Loved it.",
      containsSpoilers: false,
    });
    expect(
      (await getDiary(db, "ana")).entries.map((entry) => entry.reviewId),
    ).toEqual([review.id]);

    // Editing keeps the same review and doesn't add another activity.
    await updateLog(db, "ana", id, reviewed("Even better twice.", true));
    const [edited] = await db.select().from(reviews);
    expect(edited).toMatchObject({
      id: review.id,
      body: "Even better twice.",
      containsSpoilers: true,
    });
    expect(await reviewActivities()).toEqual([{ objectId: review.id }]);
  });

  it("adds a review to an existing log and deletes it when cleared", async () => {
    const id = await createLog(db, "ana", hades, play());
    expect(await db.$count(reviews)).toBe(0);
    expect((await getOwnedLog(db, "ana", id))?.review).toBeNull();

    await updateLog(db, "ana", id, reviewed("Came back to it."));
    const [review] = await db.select().from(reviews);
    expect(await reviewActivities()).toEqual([{ objectId: review.id }]);
    await db
      .insert(likes)
      .values({ userId: "ben", targetType: "review", targetId: review.id });

    await updateLog(db, "ana", id, play({ rating: 8 }));
    expect(await db.$count(reviews)).toBe(0);
    expect(await db.$count(likes)).toBe(0);
    expect(await reviewActivities()).toEqual([]);
    // The log itself stays, with its logged activity.
    expect((await getOwnedLog(db, "ana", id))?.rating).toBe(8);
    expect(await db.$count(activities)).toBe(1);
  });

  it("lists a game's visible reviews, newest first", async () => {
    await createLog(db, "ana", hades, reviewed("First!"));
    await createLog(db, "ben", hades, reviewed("Spoilers ahead.", true));
    const hidden = await createLog(db, "ben", hades, reviewed("Spam."));
    await createLog(db, "ana", celeste, reviewed("Other game."));
    await db
      .update(reviews)
      .set({ hiddenAt: sql`now()` })
      .where(eq(reviews.logId, hidden));

    expect(
      (await getGameReviews(db, hades)).map((review) => ({
        author: review.author,
        body: review.body,
        containsSpoilers: review.containsSpoilers,
        rating: review.rating,
      })),
    ).toEqual([
      {
        author: "ben",
        body: "Spoilers ahead.",
        containsSpoilers: true,
        rating: 8,
      },
      { author: "ana", body: "First!", containsSpoilers: false, rating: 8 },
    ]);
  });
});
