import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { upsertCatalogGames } from "@/lib/catalog/sync";
import {
  games,
  logs as logTable,
  reports,
  reviews,
  users,
} from "@/lib/db/schema";
import type { LogInput } from "@/lib/logs/input";
import { createLog, deleteLog, getGameReviews } from "@/lib/logs/service";
import {
  dismissReports,
  getHiddenReviews,
  getOpenReports,
  hideReview,
  ModerationError,
  moderationQueueLimit,
  reportReview,
  unhideReview,
} from "@/lib/moderation/service";
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

describe.skipIf(!hasTestDatabase)("moderation", () => {
  const { pool, db } = openTestDatabase();
  let hades: number;

  beforeAll(async () => {
    await resetTestDatabase(pool, db);
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE users, games, platforms, activities, likes RESTART IDENTITY CASCADE",
    );
    await db.insert(users).values(
      ["ana", "ben", "cy"].map((id) => ({
        id,
        email: `${id}@example.com`,
        username: id,
      })),
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

  const anasReview = async () => {
    const logId = await createLog(db, "ana", hades, reviewed("Buy cheap gold"));
    const [review] = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.logId, logId));
    return { logId, reviewId: review.id };
  };

  it("files one report per player and queues the review", async () => {
    const { reviewId } = await anasReview();
    expect(await reportReview(db, "ben", reviewId, "spam")).toBe(true);
    expect(await reportReview(db, "ben", reviewId, "abuse")).toBe(false);
    expect(await reportReview(db, "cy", reviewId, "abuse")).toBe(true);

    const [queued, ...rest] = await getOpenReports(db);
    expect(rest).toHaveLength(0);
    expect(queued).toMatchObject({
      id: reviewId,
      body: "Buy cheap gold",
      author: "ana",
      game: { slug: "hades", title: "Hades" },
      reportCount: 2,
    });
    expect([...queued.reasons].sort()).toEqual(["abuse", "spam"]);
    expect(queued.firstReported).toBeInstanceOf(Date);
  });

  it("refuses your own, missing and hidden reviews", async () => {
    const { reviewId } = await anasReview();
    await expect(reportReview(db, "ana", reviewId, "spam")).rejects.toThrow(
      ModerationError,
    );
    await expect(reportReview(db, "ben", 999_999, "spam")).rejects.toThrow(
      ModerationError,
    );
    await hideReview(db, reviewId);
    await expect(reportReview(db, "ben", reviewId, "spam")).rejects.toThrow(
      ModerationError,
    );
  });

  it("hides a review from game pages, closes its reports and can restore it", async () => {
    const { reviewId } = await anasReview();
    await reportReview(db, "ben", reviewId, "spam");
    await hideReview(db, reviewId);

    expect(await getGameReviews(db, hades)).toHaveLength(0);
    expect(await getOpenReports(db)).toHaveLength(0);
    expect((await getHiddenReviews(db)).reviews.map((r) => r.id)).toEqual([
      reviewId,
    ]);

    await unhideReview(db, reviewId);
    expect((await getGameReviews(db, hades)).map((r) => r.id)).toEqual([
      reviewId,
    ]);
    expect((await getHiddenReviews(db)).reviews).toHaveLength(0);
  });

  it("never leaves an open report on a review hidden at the same time", async () => {
    for (let round = 0; round < 20; round++) {
      const { reviewId } = await anasReview();
      await Promise.allSettled([
        reportReview(db, "ben", reviewId, "spam"),
        hideReview(db, reviewId),
        reportReview(db, "cy", reviewId, "abuse"),
      ]);
    }
    expect(await getOpenReports(db)).toHaveLength(0);
  });

  it("pages through hidden reviews", async () => {
    const logs = [];
    for (let i = 0; i <= moderationQueueLimit; i++) {
      logs.push({
        userId: "ana",
        gameId: hades,
        status: "finished" as const,
      });
    }
    const logIds = await db
      .insert(logTable)
      .values(logs)
      .returning({ id: logTable.id });
    await db.insert(reviews).values(
      logIds.map(({ id }, i) => ({
        logId: id,
        body: `Hidden ${i}`,
        hiddenAt: sql`now() - make_interval(secs => ${i})`,
      })),
    );
    const first = await getHiddenReviews(db);
    expect(first.reviews).toHaveLength(moderationQueueLimit);
    expect(first.reviews[0].body).toBe("Hidden 0");
    expect(first.hasMore).toBe(true);
    const second = await getHiddenReviews(db, 2);
    expect(second.reviews.map((r) => r.body)).toEqual([
      `Hidden ${moderationQueueLimit}`,
    ]);
    expect(second.hasMore).toBe(false);
  });

  it("dismisses reports and leaves the review up", async () => {
    const { reviewId } = await anasReview();
    await reportReview(db, "ben", reviewId, "other");
    await dismissReports(db, reviewId);
    expect(await getOpenReports(db)).toHaveLength(0);
    expect(await getGameReviews(db, hades)).toHaveLength(1);
    // A dismissed report still counts as the player's one report.
    expect(await reportReview(db, "ben", reviewId, "spam")).toBe(false);
  });

  it("drops reports when the review's log is deleted", async () => {
    const { logId, reviewId } = await anasReview();
    await reportReview(db, "ben", reviewId, "spam");
    await deleteLog(db, "ana", logId);
    expect(await db.select().from(reports)).toHaveLength(0);
  });
});
