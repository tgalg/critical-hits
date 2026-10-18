import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addToBacklog,
  BacklogError,
  getBacklog,
  getBacklogEntry,
  getBacklogPlatforms,
  moveBacklogItem,
  removeFromBacklog,
} from "@/lib/backlog/service";
import { upsertCatalogGames } from "@/lib/catalog/sync";
import { games, platforms, users } from "@/lib/db/schema";
import { createLog } from "@/lib/logs/service";
import {
  hasTestDatabase,
  openTestDatabase,
  resetTestDatabase,
} from "@/lib/test-database";

describe.skipIf(!hasTestDatabase)("backlog", () => {
  const { pool, db } = openTestDatabase();
  const game = new Map<string, number>();
  const platform = new Map<string, number>();

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
    const pc = { igdbId: 6, name: "PC", abbreviation: null };
    const ps5 = { igdbId: 167, name: "PS5", abbreviation: null };
    const entry = (igdbId: number, slug: string, gamePlatforms = [pc]) => ({
      igdbId,
      slug,
      title: slug,
      coverUrl: null,
      releaseDate: null,
      summary: null,
      platforms: gamePlatforms,
    });
    await upsertCatalogGames(db, [
      entry(1, "hades", [pc, ps5]),
      entry(2, "celeste"),
      entry(3, "tunic"),
      entry(4, "outer-wilds", [ps5]),
    ]);
    for (const row of await db.select().from(games)) game.set(row.slug, row.id);
    for (const row of await db.select().from(platforms))
      platform.set(row.name, row.id);
  });

  afterAll(async () => {
    await pool.end();
  });

  const order = async (userId = "ana") =>
    (await getBacklog(db, userId)).map((entry) => entry.game.slug);
  const positions = async () =>
    (await getBacklog(db, "ana")).map((entry) => entry.position);

  it("adds games to the end and ignores duplicates", async () => {
    expect(await addToBacklog(db, "ana", game.get("hades")!, null)).toBe(true);
    await addToBacklog(db, "ana", game.get("celeste")!, null);
    expect(await addToBacklog(db, "ana", game.get("hades")!, null)).toBe(false);
    expect(await order()).toEqual(["hades", "celeste"]);
  });

  it("moves games up and down and keeps positions unique", async () => {
    for (const slug of ["hades", "celeste", "tunic"]) {
      await addToBacklog(db, "ana", game.get(slug)!, null);
    }
    await moveBacklogItem(db, "ana", game.get("tunic")!, "up");
    expect(await order()).toEqual(["hades", "tunic", "celeste"]);
    await moveBacklogItem(db, "ana", game.get("hades")!, "up");
    await moveBacklogItem(db, "ana", game.get("celeste")!, "down");
    expect(await order()).toEqual(["hades", "tunic", "celeste"]);

    await removeFromBacklog(db, "ana", game.get("tunic")!);
    await addToBacklog(db, "ana", game.get("tunic")!, null);
    await moveBacklogItem(db, "ana", game.get("tunic")!, "up");
    expect(await order()).toEqual(["hades", "tunic", "celeste"]);
    const seen = await positions();
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("hands out unique positions when adds race", async () => {
    await Promise.all(
      ["hades", "celeste", "tunic", "outer-wilds"].map((slug) =>
        addToBacklog(db, "ana", game.get(slug)!, null),
      ),
    );
    const seen = await positions();
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
  });

  it("keeps each player's backlog their own", async () => {
    await addToBacklog(db, "ana", game.get("hades")!, null);
    await addToBacklog(db, "ana", game.get("celeste")!, null);
    await addToBacklog(db, "ben", game.get("hades")!, null);
    await removeFromBacklog(db, "ben", game.get("celeste")!);
    await moveBacklogItem(db, "ben", game.get("celeste")!, "up");
    expect(await order("ana")).toEqual(["hades", "celeste"]);
    expect(await order("ben")).toEqual(["hades"]);
  });

  it("only accepts the game's own platforms and filters by platform", async () => {
    await addToBacklog(db, "ana", game.get("hades")!, platform.get("PS5")!);
    await addToBacklog(db, "ana", game.get("celeste")!, platform.get("PC")!);
    await addToBacklog(db, "ana", game.get("tunic")!, null);
    await expect(
      addToBacklog(db, "ana", game.get("outer-wilds")!, platform.get("PC")!),
    ).rejects.toThrow(BacklogError);
    await expect(addToBacklog(db, "ana", 999_999, null)).rejects.toThrow(
      BacklogError,
    );

    const onPs5 = await getBacklog(db, "ana", platform.get("PS5")!);
    expect(onPs5.map((entry) => entry.game.slug)).toEqual(["hades"]);
    expect((await getBacklogPlatforms(db, "ana")).map((p) => p.name)).toEqual([
      "PC",
      "PS5",
    ]);
    expect(await getBacklogEntry(db, "ana", game.get("hades")!)).toEqual({
      platform: "PS5",
    });
    expect(
      await getBacklogEntry(db, "ana", game.get("outer-wilds")!),
    ).toBeNull();
  });

  it("leaves the backlog when the game is logged", async () => {
    await addToBacklog(db, "ana", game.get("hades")!, null);
    await addToBacklog(db, "ana", game.get("celeste")!, null);
    await createLog(db, "ana", game.get("hades")!, {
      status: "playing",
      platformId: null,
      startedOn: null,
      finishedOn: null,
      hours: null,
      rating: null,
      hearted: false,
      isReplay: false,
      review: null,
    });
    expect(await order()).toEqual(["celeste"]);
  });

  it("adds and logs the same game at once without deadlocking", async () => {
    const play = {
      status: "playing" as const,
      platformId: null,
      startedOn: null,
      finishedOn: null,
      hours: null,
      rating: null,
      hearted: false,
      isReplay: false,
      review: null,
    };
    for (let round = 0; round < 10; round++) {
      await Promise.all([
        addToBacklog(db, "ana", game.get("tunic")!, null),
        createLog(db, "ana", game.get("tunic")!, play),
        addToBacklog(db, "ana", game.get("celeste")!, null),
      ]);
      await removeFromBacklog(db, "ana", game.get("tunic")!);
      await removeFromBacklog(db, "ana", game.get("celeste")!);
    }
  });
});
