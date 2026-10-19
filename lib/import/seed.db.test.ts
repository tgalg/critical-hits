import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  activities,
  gamePlatforms,
  games,
  logs,
  oneOffJobs,
  platforms,
  reviews,
  users,
} from "@/lib/db/schema";
import { seedPlays } from "@/lib/import/seed";
import {
  hasTestDatabase,
  openTestDatabase,
  resetTestDatabase,
} from "@/lib/test-database";

describe.skipIf(!hasTestDatabase)("seedPlays", () => {
  const { pool, db } = openTestDatabase();
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    await resetTestDatabase(pool, db);
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE users, games, platforms, one_off_jobs RESTART IDENTITY CASCADE",
    );
    await db.insert(users).values({
      id: "tom",
      email: "Tom@example.com",
      emailVerified: true,
      username: "tom",
    });
    const rows = await db
      .insert(games)
      .values([
        { igdbId: 1, slug: "hollow-knight", title: "Hollow Knight" },
        { igdbId: 2, slug: "silksong", title: "Hollow Knight: Silksong" },
      ])
      .returning({ id: games.id, slug: games.slug });
    for (const row of rows) ids[row.slug] = row.id;
    const [switchPlatform] = await db
      .insert(platforms)
      .values({ igdbId: 130, name: "Nintendo Switch", abbreviation: "Switch" })
      .returning({ id: platforms.id });
    ids.switch = switchPlatform.id;
    await db
      .insert(gamePlatforms)
      .values({ gameId: ids.silksong, platformId: ids.switch });
  });

  afterAll(async () => {
    await pool.end();
  });

  const plays = [
    { title: "Hollow Knight", year: 2023 },
    { title: "Hollow Knight", year: 2025, rating: 10 },
    {
      title: "Hollow Knight: Silksong",
      year: 2025,
      startedOn: "2025-09-04",
      finishedOn: "2025-10-01",
      hours: 52.5,
      platform: "switch",
      review: "  Worth the wait.  ",
    },
    { title: "Zork Zero", year: 2024 },
    { title: "Hollow Knigh", year: 2024 },
  ];

  it("loads detailed plays once, without feed activity", async () => {
    const result = await seedPlays(db, "job", "tom@example.com", plays);
    expect(result).toEqual({
      status: "done",
      added: 3,
      missing: ["Zork Zero", "Hollow Knigh"],
    });

    const loaded = await db
      .select({
        gameId: logs.gameId,
        startedOn: logs.startedOn,
        finishedOn: logs.finishedOn,
        hours: logs.hours,
        rating: logs.rating,
        platformId: logs.platformId,
        isReplay: logs.isReplay,
        review: reviews.body,
        reviewedAt: reviews.createdAt,
      })
      .from(logs)
      .leftJoin(reviews, eq(reviews.logId, logs.id))
      .orderBy(logs.gameId, logs.isReplay);
    const [first, replay, silksong] = loaded;
    expect(first.finishedOn).toMatch(/^2023-/);
    expect(first).toMatchObject({ isReplay: false, rating: null });
    expect(replay.finishedOn).toMatch(/^2025-/);
    expect(replay).toMatchObject({ isReplay: true, rating: 10 });
    expect(silksong).toMatchObject({
      startedOn: "2025-09-04",
      finishedOn: "2025-10-01",
      hours: "52.5",
      platformId: ids.switch,
      review: "Worth the wait.",
      reviewedAt: new Date("2025-10-01T12:00:00Z"),
    });
    expect(await db.select().from(activities)).toEqual([]);
    const [knight] = await db
      .select({ avg: games.avgRating, count: games.ratingCount })
      .from(games)
      .where(eq(games.id, ids["hollow-knight"]));
    expect(knight).toEqual({ avg: "10.00", count: 1 });

    expect(await seedPlays(db, "job", "tom@example.com", plays)).toEqual({
      status: "skipped",
      reason: "already ran",
    });
    expect(await db.select().from(logs)).toHaveLength(3);
  });

  it("waits for a verified owner and skips games already logged that year", async () => {
    await db
      .update(users)
      .set({ emailVerified: false })
      .where(eq(users.id, "tom"));
    expect(await seedPlays(db, "job", "tom@example.com", plays)).toEqual({
      status: "skipped",
      reason: "no verified user",
    });
    expect(await db.select().from(oneOffJobs)).toEqual([]);

    await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, "tom"));
    await db.insert(logs).values({
      userId: "tom",
      gameId: ids.silksong,
      status: "finished",
      finishedOn: "2025-12-01",
    });
    const result = await seedPlays(db, "job", "tom@example.com", plays);
    expect(result).toMatchObject({ status: "done", added: 2 });
  });

  it("keeps a newer play's rating as the player's current one", async () => {
    await db.insert(logs).values({
      userId: "tom",
      gameId: ids["hollow-knight"],
      status: "finished",
      finishedOn: "2026-01-01",
      rating: 4,
    });
    await seedPlays(db, "job", "tom@example.com", plays);
    const [knight] = await db
      .select({ avg: games.avgRating })
      .from(games)
      .where(eq(games.id, ids["hollow-knight"]));
    expect(knight.avg).toBe("4.00");
  });
});
