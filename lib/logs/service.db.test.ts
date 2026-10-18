import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { upsertCatalogGames } from "@/lib/catalog/sync";
import {
  activities,
  backlogItems,
  games,
  logs,
  platforms,
  users,
} from "@/lib/db/schema";
import type { LogInput } from "@/lib/logs/input";
import {
  createLog,
  deleteLog,
  getDiary,
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
    const diary = await getDiary(db, "ana");
    expect(diary.map((entry) => [entry.game.title, entry.diaryDate])).toEqual([
      ["Celeste", "2026-05-01"],
      ["Hades", "2026-03-10"],
      ["Hades", "2025-12-24"],
    ]);
  });
});
