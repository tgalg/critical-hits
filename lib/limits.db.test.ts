import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { upsertCatalogGames } from "@/lib/catalog/sync";
import { activities, games, reviews, users } from "@/lib/db/schema";
import { canPost, hourlyLimits } from "@/lib/limits";
import { createList, ListError } from "@/lib/lists/service";
import type { LogInput } from "@/lib/logs/input";
import { createLog, LogError } from "@/lib/logs/service";
import { ModerationError, reportReview } from "@/lib/moderation/service";
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
  rating: null,
  hearted: false,
  isReplay: false,
  review: { body, containsSpoilers: false },
});

const list = (title: string) => ({
  title,
  description: null,
  isRanked: false,
  isPublic: true,
});

describe.skipIf(!hasTestDatabase)("posting limits", () => {
  const { pool, db } = openTestDatabase();
  let hades: number;

  beforeAll(async () => {
    await resetTestDatabase(pool, db);
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE users, games, platforms, activities, likes RESTART IDENTITY CASCADE",
    );
    await db.insert(users).values([
      { id: "new", email: "new@example.com", username: "new" },
      {
        id: "old",
        email: "old@example.com",
        username: "old",
        createdAt: sql`now() - interval '2 days'`,
      },
    ]);
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

  it("caps a new account's reviews per hour and saves nothing over it", async () => {
    for (let i = 0; i < hourlyLimits.review.newAccount; i++) {
      await createLog(db, "new", hades, reviewed(`Review ${i}`));
    }
    await expect(
      createLog(db, "new", hades, reviewed("One too many")),
    ).rejects.toThrow(LogError);
    expect(await db.$count(reviews)).toBe(hourlyLimits.review.newAccount);
    // The rejected log was rolled back with its review.
    expect(await db.$count(activities, eq(activities.verb, "logged"))).toBe(
      hourlyLimits.review.newAccount,
    );
  });

  it("gives older accounts the higher limit and forgets old posts", async () => {
    for (let i = 0; i < hourlyLimits.review.newAccount + 1; i++) {
      await createLog(db, "old", hades, reviewed(`Review ${i}`));
    }
    expect(await canPost(db, "old", "review")).toBe(true);
    await db.insert(activities).values(
      Array.from({ length: hourlyLimits.review.account }, (_, i) => ({
        actorId: "old",
        verb: "reviewed" as const,
        objectType: "review" as const,
        objectId: 100_000 + i,
      })),
    );
    expect(await canPost(db, "old", "review")).toBe(false);
    await db
      .update(activities)
      .set({ createdAt: sql`now() - interval '2 hours'` })
      .where(eq(activities.actorId, "old"));
    expect(await canPost(db, "old", "review")).toBe(true);
  });

  it("caps new accounts' lists and reports", async () => {
    for (let i = 0; i < hourlyLimits.list.newAccount; i++) {
      await createList(db, "new", list(`List ${i}`));
    }
    await expect(createList(db, "new", list("Spam"))).rejects.toThrow(
      ListError,
    );

    const reviewIds: number[] = [];
    for (let i = 0; i <= hourlyLimits.report.newAccount; i++) {
      const logId = await createLog(db, "old", hades, reviewed(`R${i}`));
      const [row] = await db
        .select({ id: reviews.id })
        .from(reviews)
        .where(eq(reviews.logId, logId));
      reviewIds.push(row.id);
    }
    for (const id of reviewIds.slice(0, -1)) {
      expect(await reportReview(db, "new", id, "spam")).toBe(true);
    }
    await expect(
      reportReview(db, "new", reviewIds.at(-1)!, "spam"),
    ).rejects.toThrow(ModerationError);
  });
});
