import type { Metadata } from "next";
import { connection } from "next/server";
import { AuthForm } from "@/components/auth/auth-form";
import { isDiscordEnabled } from "@/lib/auth-providers";
import { requiredInviteCode } from "@/lib/invite";

export const metadata: Metadata = { title: "Sign in · Critical Hits" };

export default async function Page(props: PageProps<"/sign-in">) {
  // Rendered per request so the Discord button follows runtime configuration.
  await connection();
  const { error } = await props.searchParams;
  return (
    <AuthForm
      mode="sign-in"
      discordEnabled={isDiscordEnabled()}
      inviteRequired={requiredInviteCode() !== null}
      initialError={typeof error === "string" ? error : null}
    />
  );
}
