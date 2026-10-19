import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { upsertCatalogGames } from "@/lib/catalog/sync";
import {
  activities,
  follows,
  games,
  lists,
  reviews,
  users,
} from "@/lib/db/schema";
import { createList } from "@/lib/lists/service";
import type { LogInput } from "@/lib/logs/input";
import { createLog } from "@/lib/logs/service";
import { setLike } from "@/lib/social/likes";
import {
  feedPageSize,
  follow,
  getFeed,
  getFollowState,
  getPopularReviews,
  searchPlayers,
  SocialError,
  unfollow,
} from "@/lib/social/service";
import {
  hasTestDatabase,
  addGames,
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

const list = (title: string, isPublic = true) => ({
  title,
  description: null,
  isRanked: false,
  isPublic,
});

describe.skipIf(!hasTestDatabase)("social", () => {
  const { pool, db } = openTestDatabase();
  let hades: number;

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
      {
        id: "cy",
        email: "cy@example.com",
        username: "cy_100%",
        displayName: "Anabel",
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

  it("follows one way, once, and never yourself", async () => {
    await follow(db, "ana", "ben");
    await follow(db, "ana", "ben");
    expect(await db.$count(follows)).toBe(1);
    expect(await getFollowState(db, "ben", "ana")).toEqual({
      followers: 1,
      following: 0,
      viewerFollows: true,
    });
    expect(await getFollowState(db, "ana", "ben")).toEqual({
      followers: 0,
      following: 1,
      viewerFollows: false,
    });
    expect((await getFollowState(db, "ben", null)).viewerFollows).toBe(false);
    await expect(follow(db, "ana", "ana")).rejects.toThrow(SocialError);
    await expect(follow(db, "ana", "nobody")).rejects.toThrow(SocialError);
    await unfollow(db, "ana", "ben");
    expect(await db.$count(follows)).toBe(0);
  });

  it("finds players by username or display name prefix", async () => {
    expect(
      (await searchPlayers(db, "AN")).map((p) => p.username).sort(),
    ).toEqual(["ana", "cy_100%"]);
    // LIKE wildcards in the query match only themselves.
    expect(await searchPlayers(db, "%")).toEqual([]);
    expect((await searchPlayers(db, "cy_")).map((p) => p.username)).toEqual([
      "cy_100%",
    ]);
    expect(await searchPlayers(db, "c_")).toEqual([]);
  });

  it("shows followed players' visible activity, newest first", async () => {
    await follow(db, "ana", "ben");
    await createLog(db, "ben", hades, play({ rating: 8 }));
    await createLog(
      db,
      "ben",
      hades,
      play({
        rating: 6,
        isReplay: true,
        review: { body: "Still great.", containsSpoilers: false },
      }),
    );
    // A second review of the same game can only come from before reviews
    // were one per game, so it's written directly.
    const hidden = await createLog(db, "ben", hades, play());
    await db
      .insert(reviews)
      .values({ logId: hidden, body: "Spam.", hiddenAt: sql`now()` });
    await createList(db, "ben", list("Public picks"));
    await createList(db, "ben", list("Secret", false));
    // Cy isn't followed, so their play stays out of Ana's feed.
    await createLog(db, "cy", hades, play());

    const { entries, hasMore } = await getFeed(db, "ana");
    expect(hasMore).toBe(false);
    expect(
      entries.map((entry) => ({
        verb: entry.verb,
        actor: entry.actor,
        game: entry.game?.title ?? null,
        review: entry.review?.body ?? null,
        rating: entry.review ? entry.reviewRating : entry.log?.rating,
        list: entry.list?.title ?? null,
      })),
    ).toEqual([
      {
        verb: "created_list",
        actor: "ben",
        game: null,
        review: null,
        rating: undefined,
        list: "Public picks",
      },
      // The play with a hidden review shows as a plain log.
      {
        verb: "logged",
        actor: "ben",
        game: "Hades",
        review: null,
        rating: null,
        list: null,
      },
      // A play logged with a review shows once, as the review.
      {
        verb: "reviewed",
        actor: "ben",
        game: "Hades",
        review: "Still great.",
        rating: 6,
        list: null,
      },
      {
        verb: "logged",
        actor: "ben",
        game: "Hades",
        review: null,
        rating: 8,
        list: null,
      },
    ]);
    expect((await getFeed(db, "ben")).entries).toEqual([]);
  });

  it("pages through a long feed", async () => {
    await follow(db, "ana", "ben");
    await db.insert(activities).values(
      Array.from({ length: feedPageSize + 2 }, (_, i) => ({
        actorId: "ben",
        verb: "created_list" as const,
        objectType: "list" as const,
        objectId: 100_000 + i,
      })),
    );
    // Written directly, as createList would cap a new account's lists.
    for (let i = 0; i < feedPageSize + 2; i++) {
      const [{ id }] = await db
        .insert(lists)
        .values({ ...list(`List ${i}`), userId: "ben" })
        .returning({ id: lists.id });
      await db.insert(activities).values({
        actorId: "ben",
        verb: "created_list",
        objectType: "list",
        objectId: id,
      });
    }
    const first = await getFeed(db, "ana");
    const second = await getFeed(db, "ana", 2);
    expect(first.entries).toHaveLength(feedPageSize);
    expect(first.hasMore).toBe(true);
    // Activities whose list never existed are skipped, not counted.
    expect(second.entries).toHaveLength(2);
    expect(second.hasMore).toBe(false);
  });

  it("lists other players' visible reviews, recent and liked first", async () => {
    // A player reviews each game once, so repeat reviewers use another game.
    const [other] = await addGames(db, 1);
    const review = async (userId: string, body: string, gameId = hades) => {
      const logId = await createLog(
        db,
        userId,
        gameId,
        play({ review: { body, containsSpoilers: false } }),
      );
      const [row] = await db
        .select({ id: reviews.id })
        .from(reviews)
        .where(eq(reviews.logId, logId));
      return row.id;
    };
    const old = await review("ben", "Old favourite", other);
    const liked = await review("ben", "Liked");
    await review("cy", "Plain");
    const hidden = await review("cy", "Hidden", other);
    await review("ana", "Mine");
    await setLike(db, "ana", "review", old, true);
    await setLike(db, "ana", "review", liked, true);
    await db
      .update(reviews)
      .set({ createdAt: sql`now() - interval '60 days'` })
      .where(eq(reviews.id, old));
    await db
      .update(reviews)
      .set({ hiddenAt: sql`now()` })
      .where(eq(reviews.id, hidden));

    const popular = await getPopularReviews(db, "ana");
    expect(popular.map((r) => r.body)).toEqual([
      "Liked",
      "Plain",
      "Old favourite",
    ]);
    expect(popular[0]).toMatchObject({
      author: "ben",
      likeCount: 1,
      game: { slug: "hades" },
    });
  });
});
