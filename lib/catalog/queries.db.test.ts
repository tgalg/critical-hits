import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getGameBySlug, searchGames, starRating } from "@/lib/catalog/queries";
import { upsertCatalogGames } from "@/lib/catalog/sync";
import { games } from "@/lib/db/schema";
import {
  hasTestDatabase,
  openTestDatabase,
  resetTestDatabase,
} from "@/lib/test-database";

const pc = { igdbId: 6, name: "PC (Microsoft Windows)", abbreviation: "PC" };
const switchPlatform = {
  igdbId: 130,
  name: "Nintendo Switch",
  abbreviation: null,
};
const game = (igdbId: number, title: string, slug: string) => ({
  igdbId,
  slug,
  title,
  coverUrl: null,
  releaseDate: "2017-02-24",
  summary: null,
  platforms: [pc],
});

describe.skipIf(!hasTestDatabase)("catalog queries", () => {
  const { pool, db } = openTestDatabase();

  beforeAll(async () => {
    await resetTestDatabase(pool, db);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE games, platforms RESTART IDENTITY CASCADE");
    await upsertCatalogGames(db, [
      {
        ...game(1, "Hollow Knight", "hollow-knight"),
        platforms: [pc, switchPlatform],
      },
      game(2, "Hollow Knight: Silksong", "hollow-knight-silksong"),
      game(3, "Celeste", "celeste"),
      game(4, "100% Orange Juice", "100-orange-juice"),
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  const titles = async (query: string) =>
    (await searchGames(db, query)).map((row) => row.title);

  it("finds games despite typos, best match first", async () => {
    expect(await titles("holow night")).toEqual([
      "Hollow Knight",
      "Hollow Knight: Silksong",
    ]);
  });

  it("matches short substrings and treats LIKE wildcards literally", async () => {
    expect(await titles("silk")).toEqual(["Hollow Knight: Silksong"]);
    expect(await titles("%")).toEqual(["100% Orange Juice"]);
    expect(await titles("   ")).toEqual([]);
  });

  it("loads a game page with platforms sorted by name", async () => {
    const page = await getGameBySlug(db, "hollow-knight");
    expect(page).toMatchObject({
      title: "Hollow Knight",
      platforms: [
        { name: "Nintendo Switch", abbreviation: null },
        { name: "PC (Microsoft Windows)", abbreviation: "PC" },
      ],
    });
    expect(await getGameBySlug(db, "missing")).toBeNull();
  });

  it("shows averages as five-star ratings", async () => {
    await db.update(games).set({ avgRating: "8.60", ratingCount: 5 });
    const page = await getGameBySlug(db, "celeste");
    expect(starRating(page!.avgRating)).toBe("4.3");
    expect(starRating(null)).toBeNull();
  });
});
