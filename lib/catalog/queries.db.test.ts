import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getBrowseRows,
  getGameBySlug,
  searchGames,
  starRating,
} from "@/lib/catalog/queries";
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
        { id: expect.any(Number), name: "Nintendo Switch", abbreviation: null },
        {
          id: expect.any(Number),
          name: "PC (Microsoft Windows)",
          abbreviation: "PC",
        },
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

  it("builds browse rows from popularity and release dates", async () => {
    const now = Date.parse("2026-10-19T12:00:00Z");
    const cover = "https://images.igdb.com/igdb/image/upload/t_cover_big/x.jpg";
    await pool.query("TRUNCATE games RESTART IDENTITY CASCADE");
    const add = (
      slug: string,
      popularity: { rating: number | null; ratingCount: number; hypes: number },
      releaseDate: string,
      coverUrl: string | null = cover,
    ) => ({
      ...game(slug.length, slug, slug),
      slug,
      coverUrl,
      releaseDate,
      popularity,
    });
    await upsertCatalogGames(
      db,
      [
        add(
          "classic",
          { rating: 95, ratingCount: 3000, hypes: 0 },
          "2015-05-19",
        ),
        add(
          "cult-hit",
          { rating: 98, ratingCount: 150, hypes: 0 },
          "2018-01-01",
        ),
        add("niche", { rating: 100, ratingCount: 3, hypes: 0 }, "2019-01-01"),
        add("fresh", { rating: null, ratingCount: 0, hypes: 50 }, "2026-10-01"),
        add(
          "fresh-quiet",
          { rating: null, ratingCount: 0, hypes: 0 },
          "2026-10-10",
        ),
        add("soon", { rating: null, ratingCount: 0, hypes: 80 }, "2026-12-01"),
        add(
          "no-cover",
          { rating: 99, ratingCount: 9000, hypes: 0 },
          "2010-01-01",
          null,
        ),
      ].map((row, index) => ({ ...row, igdbId: index + 1 })),
    );
    const rows = await getBrowseRows(db, { now });
    expect(
      Object.fromEntries(
        rows.map((row) => [row.id, row.games.map((g) => g.slug)]),
      ),
    ).toEqual({
      popular: ["classic", "cult-hit", "niche"],
      "highly-rated": ["cult-hit", "classic"],
      "new-releases": ["fresh"],
      "coming-soon": ["soon"],
    });
  });

  it("leaves out rows with nothing in them", async () => {
    expect(await getBrowseRows(db)).toEqual([]);
  });
});
