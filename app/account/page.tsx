import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ProfileForm } from "@/components/profile/profile-form";
import { getAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getAccount } from "@/lib/profile/service";

export const metadata: Metadata = { title: "Your account · Critical Hits" };

export default async function AccountPage() {
  // Read headers first so the page renders per request, never at build time.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in");
  const { user } = session;
  const account = await getAccount(getDatabase(), user.id);
  if (!account) redirect("/sign-in");
  const { username } = account;

  return (
    <main className="mx-auto max-w-xl space-y-8 px-6 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {account.displayName || username}
        </h1>
        <p className="text-sm text-muted-foreground">
          @{username} · {user.email}
        </p>
        <Link href={`/u/${username}`} className="text-sm underline">
          View your profile
        </Link>
      </header>
      <section aria-labelledby="profile" className="rounded-lg border p-6">
        <h2 id="profile" className="mb-4 font-medium">
          Profile
        </h2>
        <ProfileForm
          defaults={{
            username,
            displayName: account.displayName ?? "",
            bio: account.bio ?? "",
          }}
        />
      </section>
      <SignOutButton />
    </main>
  );
}
