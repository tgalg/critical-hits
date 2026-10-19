import "server-only";
import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins/username";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { isDiscordEnabled } from "@/lib/auth-providers";
import { getDatabase } from "@/lib/db";
import { accounts, sessions, users, verifications } from "@/lib/db/schema";

// Discord is the one social provider in the MVP; it is enabled only when its
// credentials are configured, so local development works with email alone.
function socialProviders() {
  return isDiscordEnabled()
    ? {
        discord: {
          clientId: process.env.DISCORD_CLIENT_ID!,
          clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        },
      }
    : {};
}

// Social sign-ups arrive without a username, but users.username is required.
// Derive candidates from the profile: the clean name first, then the name
// with a short number, and a random hex suffix only as a last resort.
// createAuth takes the first unused one, and the player is then asked to
// confirm or change it.
export function usernameBase(profile: { name?: string; email?: string }) {
  const base = (profile.name || profile.email?.split("@")[0] || "")
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, 20);
  return base.length >= 3 ? base : "player";
}

export function* usernameCandidates(profile: {
  name?: string;
  email?: string;
}) {
  const base = usernameBase(profile);
  yield base;
  for (let attempt = 0; attempt < 5; attempt++) {
    yield `${base}${10 + Math.floor(Math.random() * 90)}`;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    yield `${base}${1000 + Math.floor(Math.random() * 9000)}`;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    yield `${base}_${randomBytes(4).toString("hex")}`;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
export function createAuth(db: NodePgDatabase<any>) {
  async function unusedUsername(profile: { name?: string; email?: string }) {
    for (const candidate of usernameCandidates(profile)) {
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, candidate))
        .limit(1);
      if (!taken) return candidate;
    }
    throw new Error("Could not generate an unused username.");
  }

  return betterAuth({
    appName: "Critical Hits",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { users, sessions, accounts, verifications },
    }),
    user: {
      modelName: "users",
      fields: { name: "displayName", image: "avatarUrl" },
    },
    session: { modelName: "sessions" },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if ((user as { username?: string }).username) return;
            const username = await unusedUsername(user);
            return {
              data: { ...user, username, displayUsername: username },
            };
          },
        },
      },
    },
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    socialProviders: socialProviders(),
    plugins: [
      username({ minUsernameLength: 3, maxUsernameLength: 30 }),
      // Lets server actions set auth cookies; must stay last.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & {
  criticalHitsAuth?: Auth;
};

// Created on first use so builds and tests without DATABASE_URL never connect.
export function getAuth() {
  return (globalForAuth.criticalHitsAuth ??= createAuth(getDatabase()));
}
