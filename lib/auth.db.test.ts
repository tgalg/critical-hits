import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuth, fallbackUsername } from "@/lib/auth";
import { accounts, sessions, users } from "@/lib/db/schema";
import { inviteCookie, inviteToken } from "@/lib/invite";
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

  it("gives sign-ups without a username a unique one", async () => {
    // Social sign-ups arrive without a username; an email sign-up that omits
    // it runs the same user-creation hook through a real endpoint.
    const signUpWithout = (email: string) =>
      auth.api.signUpEmail({
        body: { email, name: "Eve Online!", password: "correct horse battery" },
      });
    const first = await signUpWithout("eve@example.com");
    const second = await signUpWithout("eve2@example.com");
    const rows = await db.select({ username: users.username }).from(users);
    expect(rows.map((row) => row.username)).toEqual([
      expect.stringMatching(/^eveonline_[0-9a-f]{8}$/),
      expect.stringMatching(/^eveonline_[0-9a-f]{8}$/),
    ]);
    expect(first.user.id).not.toBe(second.user.id);
    expect(rows[0].username).not.toBe(rows[1].username);
  });

  it("refuses new accounts without the invite while one is required", async () => {
    process.env.SIGNUP_INVITE_CODE = "level-up";
    try {
      await expect(
        auth.api.signUpEmail({
          body: {
            email: "gatecrasher@example.com",
            name: "Gate",
            username: "gatecrasher",
            password: "correct horse battery",
          },
        }),
      ).rejects.toThrow(/invite_required/);
      const invited = await auth.api.signUpEmail({
        body: {
          email: "friend@example.com",
          name: "Friend",
          username: "friend",
          password: "correct horse battery",
        },
        headers: new Headers({
          cookie: `${inviteCookie}=${inviteToken("level-up")}`,
        }),
      });
      expect(invited.user.email).toBe("friend@example.com");
    } finally {
      delete process.env.SIGNUP_INVITE_CODE;
    }
  });

  it("falls back to the email or a default when the name has no usable characters", () => {
    expect(fallbackUsername({ name: "★★", email: "Zed@x.io" })).toMatch(
      /^player_[0-9a-f]{8}$/,
    );
    expect(fallbackUsername({ email: "Zed.K@x.io" })).toMatch(
      /^zed\.k_[0-9a-f]{8}$/,
    );
  });
});
