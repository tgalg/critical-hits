import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  backlogItems,
  follows,
  games,
  logs,
  reviews,
  users,
} from "@/lib/db/schema";

// Runs only against a disposable database: the suite drops and recreates its schema.
const url = process.env.TEST_DATABASE_URL;
const disposable =
  !!url && new URL(url).pathname.replace(/^\//, "").endsWith("_test");

if (url && !disposable) {
  throw new Error("TEST_DATABASE_URL must name a database ending in _test.");
}

describe.skipIf(!disposable)("database schema", () => {
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  beforeAll(async () => {
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE users, games, platforms RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seed() {
    await db.insert(users).values([
      { id: "u1", username: "Ana" },
      { id: "u2", username: "ben" },
    ]);
    const [game] = await db
      .insert(games)
      .values({ igdbId: 1, slug: "hades", title: "Hades" })
      .returning();
    return game;
  }

  // Postgres reports constraint names on the driver error's cause.
  async function violation(query: Promise<unknown>) {
    const error = await query.then(
      () => null,
      (e: { cause?: { constraint?: string; code?: string } }) => e.cause ?? e,
    );
    expect(error, "expected the insert to be rejected").not.toBeNull();
    return error as { constraint?: string; code?: string };
  }

  it("creates every planned table", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      "activities",
      "backlog_items",
      "follows",
      "game_platforms",
      "games",
      "likes",
      "list_items",
      "lists",
      "logs",
      "platforms",
      "reviews",
      "users",
    ]);
  });

  it("accepts half-star ratings 1-10 and rejects others", async () => {
    const game = await seed();
    const base = { userId: "u1", gameId: game.id, status: "finished" as const };
    await db.insert(logs).values([
      { ...base, rating: 1 },
      { ...base, rating: 10, isReplay: true },
    ]);
    for (const rating of [0, 11]) {
      const error = await violation(
        db.insert(logs).values({ ...base, rating }),
      );
      expect(error.constraint).toBe("logs_rating_range");
    }
  });

  it("rejects a finish date before the start date", async () => {
    const game = await seed();
    const error = await violation(
      db.insert(logs).values({
        userId: "u1",
        gameId: game.id,
        status: "finished",
        startedOn: "2026-02-01",
        finishedOn: "2026-01-01",
      }),
    );
    expect(error.constraint).toBe("logs_dates_ordered");
  });

  it("allows at most one review per log", async () => {
    const game = await seed();
    const [log] = await db
      .insert(logs)
      .values({ userId: "u1", gameId: game.id, status: "playing" })
      .returning();
    await db.insert(reviews).values({ logId: log.id, body: "Great run." });
    const error = await violation(
      db.insert(reviews).values({ logId: log.id, body: "Second take." }),
    );
    expect(error.code).toBe("23505");
  });

  it("treats usernames as case-insensitive and caps favourites at four", async () => {
    await seed();
    const duplicate = await violation(
      db.insert(users).values({ id: "u3", username: "ANA" }),
    );
    expect(duplicate.constraint).toBe("users_username_lower_idx");
    const favourites = await violation(
      db.insert(users).values({
        id: "u4",
        username: "cat",
        favouriteGameIds: [1, 2, 3, 4, 5],
      }),
    );
    expect(favourites.constraint).toBe("users_favourite_games_max_4");
  });

  it("rejects self-follows and duplicate backlog entries", async () => {
    const game = await seed();
    await db.insert(follows).values({ followerId: "u1", followeeId: "u2" });
    const self = await violation(
      db.insert(follows).values({ followerId: "u1", followeeId: "u1" }),
    );
    expect(self.constraint).toBe("follows_not_self");
    await db
      .insert(backlogItems)
      .values({ userId: "u1", gameId: game.id, position: 1 });
    const duplicate = await violation(
      db
        .insert(backlogItems)
        .values({ userId: "u1", gameId: game.id, position: 2 }),
    );
    expect(duplicate.code).toBe("23505");
  });

  it("removes a user's logs and reviews when the user is deleted", async () => {
    const game = await seed();
    const [log] = await db
      .insert(logs)
      .values({ userId: "u1", gameId: game.id, status: "finished" })
      .returning();
    await db.insert(reviews).values({ logId: log.id, body: "Loved it." });
    await db.delete(users).where(sql`${users.id} = 'u1'`);
    expect(await db.$count(logs)).toBe(0);
    expect(await db.$count(reviews)).toBe(0);
  });

  it("finds games by approximate title with the trigram index", async () => {
    await db.insert(games).values([
      { igdbId: 10, slug: "hollow-knight", title: "Hollow Knight" },
      { igdbId: 11, slug: "celeste", title: "Celeste" },
    ]);
    const { rows } = await pool.query<{ title: string }>(
      "SELECT title FROM games WHERE title % $1 ORDER BY similarity(title, $1) DESC",
      ["holow night"],
    );
    expect(rows.map((row) => row.title)).toEqual(["Hollow Knight"]);
  });
});
