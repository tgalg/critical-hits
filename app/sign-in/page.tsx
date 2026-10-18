import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthForm } from "@/components/auth/auth-form";
import { isDiscordEnabled } from "@/lib/auth-providers";

export const metadata: Metadata = { title: "Sign in · Critical Hits" };

export default async function Page() {
  // Rendered per request so the Discord button follows runtime configuration.
  await connection();
  return <AuthForm mode="sign-in" discordEnabled={isDiscordEnabled()} />;
}
