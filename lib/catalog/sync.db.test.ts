import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CatalogGame, CatalogSource } from "@/lib/catalog/source";
import { runNightlySync, syncCatalog } from "@/lib/catalog/sync";
import { gamePlatforms, games, platforms } from "@/lib/db/schema";
import { mapIgdbGame, type IgdbGame } from "@/lib/igdb/source";
import fixture from "@/lib/igdb/__fixtures__/games.json";
import {
  hasTestDatabase,
  openTestDatabase,
  resetTestDatabase,
} from "@/lib/test-database";

// Serves fixed games the way IGDB pages them: ascending id, after a cursor.
function fixedSource(catalog: CatalogGame[]): CatalogSource {
  return {
    async fetchGames({ after, limit }) {
      return catalog.filter((game) => game.igdbId > after).slice(0, limit);
    },
  };
}

describe.skipIf(!hasTestDatabase)("catalog sync", () => {
  const { pool, db } = openTestDatabase();
  const catalog = (fixture as IgdbGame[]).map(mapIgdbGame);

  beforeAll(async () => {
    await resetTestDatabase(pool, db);
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE games, platforms, sync_cursors RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  const counts = async () => ({
    games: await db.$count(games),
    platforms: await db.$count(platforms),
    links: await db.$count(gamePlatforms),
  });

  it("is idempotent across runs and pages", async () => {
    const result = await syncCatalog(db, fixedSource(catalog), { pageSize: 1 });
    expect(result).toEqual({ games: 2, cursor: 113112, done: true });
    const first = await counts();
    expect(first).toEqual({ games: 2, platforms: 3, links: 4 });

    await syncCatalog(db, fixedSource(catalog));
    expect(await counts()).toEqual(first);
  });

  it("updates changed games and their platforms", async () => {
    await syncCatalog(db, fixedSource(catalog));
    const changed = catalog.map((game) =>
      game.igdbId === 113112
        ? { ...game, title: "Hades (2020)", platforms: [game.platforms[0]] }
        : game,
    );
    await syncCatalog(db, fixedSource(changed));
    const [hades] = await db
      .select()
      .from(games)
      .where(eq(games.igdbId, 113112));
    expect(hades.title).toBe("Hades (2020)");
    expect(
      await db.$count(gamePlatforms, eq(gamePlatforms.gameId, hades.id)),
    ).toBe(1);
  });

  it("stops after maxPages and resumes from the cursor", async () => {
    const partial = await syncCatalog(db, fixedSource(catalog), {
      pageSize: 1,
      maxPages: 1,
    });
    expect(partial).toEqual({ games: 1, cursor: 1942, done: false });
    const rest = await syncCatalog(db, fixedSource(catalog), {
      pageSize: 1,
      after: partial.cursor,
    });
    expect(rest.done).toBe(true);
    expect(await db.$count(games)).toBe(2);
  });

  it("stops starting pages once the deadline passes", async () => {
    const result = await syncCatalog(db, fixedSource(catalog), {
      pageSize: 1,
      deadline: 0,
    });
    expect(result).toEqual({ games: 1, cursor: 1942, done: false });
  });

  it("backfills across nightly runs without skipping ids", async () => {
    const all = [...catalog];
    const recent: CatalogGame[] = [];
    const source: CatalogSource = {
      async fetchGames({ after, limit, updatedSince }) {
        return (updatedSince ? recent : all)
          .filter((game) => game.igdbId > after)
          .slice(0, limit);
      },
    };
    const deadline = Date.now() + 60_000;

    // Night one runs out of time after one backfill page.
    const first = await runNightlySync(db, source, {
      deadline,
      pageSize: 1,
      backfillPages: 1,
    });
    expect(first.backfill).toMatchObject({ cursor: 1942, done: false });

    // A brand-new game with a high id arrives as a recent change; the backfill
    // must still pick up the older game it had not reached yet.
    const newGame = { ...catalog[0], igdbId: 999_999, slug: "brand-new" };
    all.push(newGame);
    recent.push(newGame);
    const second = await runNightlySync(db, source, { deadline, pageSize: 1 });
    expect(second.backfill).toMatchObject({ cursor: 999_999, done: true });
    expect(await db.$count(games)).toBe(3);

    // Once done, later nights skip the backfill.
    const third = await runNightlySync(db, source, { deadline });
    expect(third.backfill).toMatchObject({ done: true });
  });
});
