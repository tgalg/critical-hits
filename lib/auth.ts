import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins/username";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
export function createAuth(db: NodePgDatabase<any>) {
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
