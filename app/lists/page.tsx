import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListForm } from "@/components/lists/list-form";
import { getDatabase } from "@/lib/db";
import { getUserLists } from "@/lib/lists/service";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Your lists · Critical Hits" };

export default async function ListsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const lists = await getUserLists(getDatabase(), user.id);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Your lists</h1>
      {lists.length === 0 ? (
        <p className="text-muted-foreground">
          No lists yet. Start one below, then add games from their pages.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {lists.map((list) => (
            <li
              key={list.id}
              className="flex flex-wrap items-center justify-between gap-2 p-4"
            >
              <Link
                href={`/lists/${list.id}`}
                className="font-medium hover:underline"
              >
                {list.title}
              </Link>
              <span className="text-sm text-muted-foreground">
                {list.gameCount} {list.gameCount === 1 ? "game" : "games"}
                {list.isRanked && " · Ranked"}
                {list.isPublic ? " · Public" : " · Private"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="new-list" className="rounded-lg border p-6">
        <h2 id="new-list" className="mb-4 font-medium">
          New list
        </h2>
        <ListForm submitLabel="Create list" />
      </section>
    </main>
  );
}
