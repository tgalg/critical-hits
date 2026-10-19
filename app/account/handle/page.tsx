import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HandleForm } from "@/components/profile/handle-form";
import { getDatabase } from "@/lib/db";
import { getAccount } from "@/lib/profile/service";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Your username · Critical Hits" };

// Discord sign-ups land here first (newUserCallbackURL in the auth form) to
// confirm or change the username made from their Discord name; the profile
// page links here too.
export default async function HandlePage(props: PageProps<"/account/handle">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const account = await getAccount(getDatabase(), user.id);
  if (!account) redirect("/sign-in");
  const welcome = (await props.searchParams).welcome !== undefined;

  return (
    <main className="mx-auto max-w-md space-y-6 px-6 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {welcome ? "Welcome! Pick your username" : "Change your username"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {welcome
            ? "This is how other players find and mention you. We suggested one from your Discord name."
            : "Your profile link changes with it. You can change it again any time."}
        </p>
      </header>
      <HandleForm
        current={account.username}
        skipHref={welcome ? `/u/${account.username}` : "/account"}
        skipLabel={welcome ? `Keep @${account.username}` : "Cancel"}
      />
    </main>
  );
}
