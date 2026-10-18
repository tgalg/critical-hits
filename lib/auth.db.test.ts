import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuth } from "@/lib/auth";
import { accounts, sessions, users } from "@/lib/db/schema";
import {
  hasTestDatabase,
  openTestDatabase,
  resetTestDatabase,
} from "@/lib/test-database";

describe.skipIf(!hasTestDatabase)("authentication", () => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-characters-long";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  const { pool, db } = openTestDatabase();
  const auth = createAuth(db);

  beforeAll(async () => {
    await resetTestDatabase(pool, db);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
  });

  afterAll(async () => {
    await pool.end();
  });

  const signUp = (body: {
    email: string;
    username: string;
    name?: string;
    password?: string;
  }) =>
    auth.api.signUpEmail({
      body: { name: body.username, password: "correct horse battery", ...body },
    });

  it("signs up with email, password and username into the users table", async () => {
    const result = await signUp({
      email: "ana@example.com",
      username: "AnaPlays",
      name: "Ana",
    });
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, result.user.id));
    expect(row).toMatchObject({
      email: "ana@example.com",
      username: "anaplays",
      displayUsername: "AnaPlays",
      displayName: "Ana",
      emailVerified: false,
    });
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, row.id));
    expect(account.providerId).toBe("credential");
    expect(account.password).not.toContain("correct horse");
  });

  it("signs in by email or username and creates a session", async () => {
    await signUp({ email: "ben@example.com", username: "ben" });
    const byEmail = await auth.api.signInEmail({
      body: { email: "ben@example.com", password: "correct horse battery" },
    });
    const byUsername = await auth.api.signInUsername({
      body: { username: "BEN", password: "correct horse battery" },
    });
    expect(byEmail.user.email).toBe("ben@example.com");
    expect(byUsername?.user.email).toBe("ben@example.com");
    // Sign-up signs the user in too, so three sessions in total.
    expect(await db.$count(sessions)).toBe(3);
  });

  it("rejects a wrong password, a taken username and a short password", async () => {
    await signUp({ email: "cat@example.com", username: "cat" });
    await expect(
      auth.api.signInEmail({
        body: { email: "cat@example.com", password: "wrong password!" },
      }),
    ).rejects.toThrow();
    await expect(
      signUp({ email: "other@example.com", username: "CAT" }),
    ).rejects.toThrow();
    await expect(
      signUp({ email: "dan@example.com", username: "dan", password: "short" }),
    ).rejects.toThrow();
    expect(await db.$count(users)).toBe(1);
  });
});
