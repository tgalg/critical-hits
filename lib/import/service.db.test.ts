import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { activities, backlogItems, games, logs, users } from "@/lib/db/schema";
import { parseImportText } from "@/lib/import/parse";
import { importEntries, matchEntries } from "@/lib/import/service";
import {
  hasTestDatabase,
  openTestDatabase,
  resetTestDatabase,
} from "@/lib/test-database";

describe.skipIf(!hasTestDatabase)("import", () => {
  const { pool, db } = openTestDatabase();
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    await resetTestDatabase(pool, db);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE users, games RESTART IDENTITY CASCADE");
    await db
      .insert(users)
      .values({ id: "ana", email: "ana@example.com", username: "ana" });
    const rows = await db
      .insert(games)
      .values([
        {
          igdbId: 1,
          slug: "re2",
          title: "Resident Evil 2",
          releaseDate: "1998-01-21",
          igdbRatingCount: 900,
        },
        {
          igdbId: 2,
          slug: "re2-remake",
          title: "Resident Evil 2",
          releaseDate: "2019-01-25",
          igdbRatingCount: 1200,
        },
        {
          igdbId: 3,
          slug: "soulsilver",
          title: "Pokémon SoulSilver Version",
          igdbRatingCount: 300,
        },
        {
          igdbId: 4,
          slug: "hollow-knight",
          title: "Hollow Knight",
          igdbRatingCount: 2000,
        },
        { igdbId: 6, slug: "cerny", title: "Černý Ýeti", igdbRatingCount: 1 },
        {
          igdbId: 5,
          slug: "hollow-knight-silksong",
          title: "Hollow Knight: Silksong",
          igdbRatingCount: 400,
        },
      ])
      .returning({ id: games.id, slug: games.slug });
    for (const row of rows) ids[row.slug] = row.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  const match = (text: string) =>
    matchEntries(db, "ana", parseImportText(text, "2026-10-19"));

  it("prefers exact titles, the most rated version, and release-year hints", async () => {
    const [plain, hinted, accented, sequel] = await match(
      "2021\nresident evil 2\nResident Evil 2 (1998)\nPokemon SoulSilver Version\nHollow Knight Silksong",
    );
    expect(plain).toMatchObject({
      match: "exact",
      game: { id: ids["re2-remake"] },
    });
    expect(hinted).toMatchObject({ match: "exact", game: { id: ids.re2 } });
    expect(accented).toMatchObject({
      match: "exact",
      game: { id: ids.soulsilver },
    });
    expect(sequel).toMatchObject({
      match: "exact",
      game: { id: ids["hollow-knight-silksong"] },
    });
  });

  it("strips any decomposable accent on both sides", async () => {
    const [entry] = await match("Cerny Yeti");
    expect(entry).toMatchObject({ match: "exact", game: { id: ids.cerny } });
  });

  it("falls back to close matches and reports titles it can't find", async () => {
    const [close, missing] = await match(
      "2021\nPokemon Soul Silver\nZork Zero",
    );
    expect(close).toMatchObject({
      match: "close",
      game: { id: ids.soulsilver },
    });
    expect(missing).toMatchObject({ match: "none", game: null });
  });

  it("imports finished plays without feed activity, marking replays and duplicates", async () => {
    await db
      .insert(backlogItems)
      .values({ userId: "ana", gameId: ids["hollow-knight"], position: 1 });
    const entries = await match(
      "2023\nHollow Knight\n2025\nHollow Knight\nHollow Knight",
    );
    expect(entries.map((e) => e.duplicate)).toEqual([false, false, true]);
    expect(await importEntries(db, "ana", entries)).toBe(2);

    const plays = await db
      .select({
        finishedOn: logs.finishedOn,
        isReplay: logs.isReplay,
        status: logs.status,
      })
      .from(logs)
      .where(eq(logs.userId, "ana"))
      .orderBy(logs.finishedOn);
    expect(
      plays.map((p) => [p.finishedOn!.slice(0, 4), p.isReplay, p.status]),
    ).toEqual([
      ["2023", false, "finished"],
      ["2025", true, "finished"],
    ]);
    expect(await db.select().from(activities)).toEqual([]);
    expect(await db.select().from(backlogItems)).toEqual([]);

    // Running the same import again adds nothing.
    const again = await match("2023\nHollow Knight\n2025\nHollow Knight");
    expect(again.every((e) => e.duplicate)).toBe(true);
    expect(await importEntries(db, "ana", again)).toBe(0);
  });

  it("rechecks duplicates when importing, using each play's diary year", async () => {
    await db.insert(logs).values({
      userId: "ana",
      gameId: ids["hollow-knight"],
      status: "finished",
      startedOn: "2023-05-01",
    });
    const stale = await match("2024\nHollow Knight\n2023\nHollow Knight");
    expect(stale.map((e) => e.duplicate)).toEqual([false, true]);
    // A second tab that previewed before the first one imported.
    const otherTab = stale.map((e) => ({ ...e }));
    expect(await importEntries(db, "ana", stale)).toBe(1);
    expect(await importEntries(db, "ana", otherTab)).toBe(0);
    expect(await db.select().from(logs)).toHaveLength(2);
  });

  it("treats undated entries as this year's plays when checking duplicates", async () => {
    expect(await importEntries(db, "ana", await match("Hollow Knight"))).toBe(
      1,
    );
    const again = await match("Hollow Knight");
    expect(again[0].duplicate).toBe(true);
    expect(await importEntries(db, "ana", again)).toBe(0);
  });
});
