import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addToBacklog } from "@/lib/backlog/service";
import { upsertCatalogGames } from "@/lib/catalog/sync";
import { games, reviews, users } from "@/lib/db/schema";
import { addToList, createList } from "@/lib/lists/service";
import type { LogInput } from "@/lib/logs/input";
import { createLog } from "@/lib/logs/service";
import {
  getAccount,
  getFavouriteIds,
  getProfile,
  ProfileError,
  toggleFavourite,
  updateProfile,
} from "@/lib/profile/service";
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

describe.skipIf(!hasTestDatabase)("profiles", () => {
  const { pool, db } = openTestDatabase();
  const game = new Map<string, number>();
  const slugs = ["hades", "celeste", "tunic", "outer-wilds", "hollow-knight"];

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
    await upsertCatalogGames(
      db,
      slugs.map((slug, i) => ({
        igdbId: i + 1,
        slug,
        title: slug,
        coverUrl: null,
        releaseDate: null,
        summary: null,
        platforms: [],
      })),
    );
    for (const row of await db.select().from(games)) game.set(row.slug, row.id);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("renames a player and refuses a taken username", async () => {
    await updateProfile(db, "ana", {
      username: "Ana.Plays",
      displayName: "Ana",
      bio: "Roguelikes.",
      backlogPublic: true,
    });
    expect(await getAccount(db, "ana")).toEqual({
      username: "Ana.Plays",
      displayName: "Ana",
      bio: "Roguelikes.",
      backlogPublic: true,
    });
    const [row] = await db.select().from(users).where(eq(users.id, "ana"));
    expect(row.username).toBe("ana.plays");
    // Usernames are unique whatever their casing.
    await expect(
      updateProfile(db, "ben", {
        username: "ANA.PLAYS",
        displayName: null,
        bio: null,
        backlogPublic: true,
      }),
    ).rejects.toThrow(ProfileError);
    expect((await getProfile(db, "ANA.plays", 2026))?.user.id).toBe("ana");
    expect(await getProfile(db, "ana", 2026)).toBeNull();
  });

  it("keeps up to four favourites in the order picked", async () => {
    for (const slug of ["tunic", "hades", "celeste", "outer-wilds"]) {
      expect(await toggleFavourite(db, "ana", game.get(slug)!)).toBe(true);
    }
    await expect(
      toggleFavourite(db, "ana", game.get("hollow-knight")!),
    ).rejects.toThrow("You already have four favourites. Remove one first.");
    expect(await toggleFavourite(db, "ana", game.get("hades")!)).toBe(false);
    await toggleFavourite(db, "ana", game.get("hollow-knight")!);
    expect(
      (await getProfile(db, "ana", 2026))?.favourites.map((g) => g.title),
    ).toEqual(["tunic", "celeste", "outer-wilds", "hollow-knight"]);
    await expect(toggleFavourite(db, "ben", 999_999)).rejects.toThrow(
      ProfileError,
    );
    expect(await getFavouriteIds(db, "ben")).toEqual([]);
  });

  it("never stores a fifth favourite when adding at once", async () => {
    const results = await Promise.allSettled(
      slugs.map((slug) => toggleFavourite(db, "ana", game.get(slug)!)),
    );
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await getFavouriteIds(db, "ana")).toHaveLength(4);
  });

  it("gathers stats and public activity", async () => {
    await createLog(
      db,
      "ana",
      game.get("hades")!,
      play({ finishedOn: "2026-03-01", hours: "40.5", rating: 9 }),
    );
    await createLog(
      db,
      "ana",
      game.get("hades")!,
      play({ finishedOn: "2025-12-01", isReplay: true }),
    );
    await createLog(
      db,
      "ana",
      game.get("celeste")!,
      play({
        status: "playing",
        hours: "2",
        review: { body: "So far so good.", containsSpoilers: false },
      }),
    );
    const hidden = await createLog(
      db,
      "ana",
      game.get("tunic")!,
      play({
        finishedOn: "2026-05-01",
        review: { body: "Hidden.", containsSpoilers: false },
      }),
    );
    await db
      .update(reviews)
      .set({ hiddenAt: sql`now()` })
      .where(eq(reviews.logId, hidden));
    await createLog(db, "ben", game.get("tunic")!, play());
    const open = await createList(db, "ana", {
      title: "Open",
      description: null,
      isRanked: false,
      isPublic: true,
    });
    await addToList(db, "ana", open, game.get("hades")!);
    await createList(db, "ana", {
      title: "Secret",
      description: null,
      isRanked: false,
      isPublic: false,
    });
    await addToBacklog(db, "ana", game.get("outer-wilds")!, null);

    const profile = (await getProfile(db, "ana", 2026))!;
    expect(profile.stats).toEqual({
      gamesPlayed: 3,
      // Hades and Tunic in 2026; the 2025 replay and the unfinished play don't count.
      finishedThisYear: 2,
      hours: "42.5",
      reviews: 1,
      backlog: 1,
      lists: 1,
    });
    expect(profile.recentLogs).toHaveLength(4);
    expect(profile.recentReviews.map((r) => r.body)).toEqual([
      "So far so good.",
    ]);
    expect(profile.lists).toEqual([{ id: open, title: "Open", gameCount: 1 }]);
    expect(profile.backlog?.map((entry) => entry.game.title)).toEqual([
      "outer-wilds",
    ]);
  });

  it("shows a private backlog only to its owner", async () => {
    await addToBacklog(db, "ana", game.get("outer-wilds")!, null);
    await updateProfile(db, "ana", {
      username: "ana",
      displayName: null,
      bio: null,
      backlogPublic: false,
    });
    for (const viewer of [null, "ben"]) {
      const profile = (await getProfile(db, "ana", 2026, viewer))!;
      expect(profile.backlog).toBeNull();
      expect(profile.stats.backlog).toBeNull();
    }
    const own = (await getProfile(db, "ana", 2026, "ana"))!;
    expect(own.backlog).toHaveLength(1);
    expect(own.stats.backlog).toBe(1);
    expect((await getAccount(db, "ana"))?.backlogPublic).toBe(false);
  });
});
