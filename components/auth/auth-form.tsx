"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { rememberInvite } from "@/app/sign-up/actions";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

const inviteMessages = {
  "sign-up": "Enter your invite code first.",
  "sign-in":
    "Critical Hits is invite-only for now. Create your account on the sign-up page with your invite code.",
};

const wrongInvite = "That invite code isn't right.";

// Better Auth reports a missing invite with this code (lib/invite.ts).
const isInviteError = (error: { code?: string; message?: string }) =>
  /invite_required/i.test(`${error.code ?? ""} ${error.message ?? ""}`);

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";
const buttonClass =
  "w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<"input">) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      <input className={inputClass} required {...props} />
    </label>
  );
}

export function AuthForm({
  mode,
  discordEnabled,
  inviteRequired = false,
  initialError = null,
}: {
  mode: Mode;
  discordEnabled: boolean;
  inviteRequired?: boolean;
  // An error code a Discord sign-in redirected back with.
  initialError?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    initialError === "invite_required"
      ? inviteMessages[mode]
      : initialError
        ? "Discord sign-in failed. Try again."
        : null,
  );
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState("");
  const askInvite = mode === "sign-up" && inviteRequired;

  // Trades the typed invite for the cookie sign-up checks; false if wrong.
  async function checkInvite() {
    if (!askInvite) return true;
    if (await rememberInvite(invite)) return true;
    setError(wrongInvite);
    setPending(false);
    return false;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    setPending(true);
    setError(null);
    if (!(await checkInvite())) return;
    const password = String(form.get("password") ?? "");
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            email: value("email"),
            username: value("username"),
            name: value("name") || value("username"),
            password,
          })
        : value("identifier").includes("@")
          ? await authClient.signIn.email({
              email: value("identifier"),
              password,
            })
          : await authClient.signIn.username({
              username: value("identifier"),
              password,
            });
    setPending(false);
    if (result.error) {
      setError(
        isInviteError(result.error)
          ? inviteMessages[mode]
          : (result.error.message ?? "Something went wrong. Try again."),
      );
      return;
    }
    router.push("/account");
    router.refresh();
  }

  // On success the browser leaves for Discord; anything else is shown here
  // instead of failing silently.
  async function onDiscord() {
    setPending(true);
    setError(null);
    try {
      if (!(await checkInvite())) return;
      const result = await authClient.signIn.social({
        provider: "discord",
        callbackURL: "/account",
        // A refused sign-up comes back here with ?error=<code>.
        errorCallbackURL: mode === "sign-up" ? "/sign-up" : "/sign-in",
      });
      if (result.error) {
        setError(result.error.message || "Discord sign-in failed. Try again.");
        setPending(false);
      }
    } catch {
      setError(
        "Couldn't reach the server. Check your connection and try again.",
      );
      setPending(false);
    }
  }

  const signingUp = mode === "sign-up";

  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-6 p-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {signingUp ? "Create your account" : "Sign in to Critical Hits"}
          </h1>
          <form className="space-y-4" onSubmit={onSubmit}>
            {signingUp ? (
              <>
                <Field
                  label="Email"
                  name="email"
                  type="email"
                  autoComplete="email"
                />
                <Field
                  label="Username"
                  name="username"
                  autoComplete="username"
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z0-9_.]+"
                  title="Letters, numbers, underscores and dots"
                />
                <Field
                  label="Display name (optional)"
                  name="name"
                  autoComplete="name"
                  required={false}
                />
                {askInvite && (
                  <Field
                    label="Invite code"
                    name="invite"
                    autoComplete="off"
                    value={invite}
                    onChange={(event) => setInvite(event.target.value)}
                  />
                )}
              </>
            ) : (
              <Field
                label="Email or username"
                name="identifier"
                autoComplete="username"
              />
            )}
            <Field
              label="Password"
              name="password"
              type="password"
              minLength={8}
              autoComplete={signingUp ? "new-password" : "current-password"}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <button type="submit" className={buttonClass} disabled={pending}>
              {signingUp ? "Sign up" : "Sign in"}
            </button>
          </form>
          {discordEnabled && (
            <button
              type="button"
              className={buttonClass
                .replace("bg-primary", "bg-[#5865F2]")
                .replace("text-primary-foreground", "text-white")}
              disabled={pending}
              onClick={onDiscord}
            >
              Continue with Discord
            </button>
          )}
          <p className="text-sm text-muted-foreground">
            {signingUp ? (
              <>
                Already have an account?{" "}
                <Link className="underline" href="/sign-in">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link className="underline" href="/sign-up">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
