import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card, CardContent } from "@/components/ui/card";
import { getAuth } from "@/lib/auth";

export const metadata: Metadata = { title: "Your account · Critical Hits" };

export default async function AccountPage() {
  // Read headers first so the page renders per request, never at build time.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in");
  const { user } = session;

  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {user.name || user.displayUsername || user.username}
          </h1>
          <p className="text-sm text-muted-foreground">
            @{user.displayUsername ?? user.username} · {user.email}
          </p>
          <SignOutButton />
        </CardContent>
      </Card>
    </main>
  );
}
