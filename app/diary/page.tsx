import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GameCover } from "@/components/catalog/game-cover";
import { LogDetails } from "@/components/logs/log-details";
import { getDatabase } from "@/lib/db";
import { getDiary } from "@/lib/logs/service";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Your diary · Critical Hits" };

const monthFormat = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export default async function DiaryPage(props: PageProps<"/diary">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { page: pageParam } = await props.searchParams;
  const requested = Number(pageParam);
  const page = Number.isSafeInteger(requested) && requested > 1 ? requested : 1;
  const { entries, hasMore } = await getDiary(getDatabase(), user.id, page);

  // Entries arrive newest first; group consecutive ones by month.
  const months: { label: string; entries: typeof entries }[] = [];
  for (const entry of entries) {
    const label = monthFormat.format(new Date(`${entry.diaryDate}T00:00:00Z`));
    if (months.at(-1)?.label !== label) months.push({ label, entries: [] });
    months.at(-1)!.entries.push(entry);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Your diary</h1>
      {months.length === 0 && page === 1 && (
        <p className="text-muted-foreground">
          Nothing logged yet.{" "}
          <Link href="/games" className="underline">
            Find a game
          </Link>{" "}
          and log your first play.
        </p>
      )}
      {months.map((month) => (
        <section key={month.label} className="space-y-3">
          <h2 className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
            {month.label}
          </h2>
          <ul className="divide-y rounded-lg border">
            {month.entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-4 p-3">
                <span className="w-8 text-center text-lg font-semibold tabular-nums">
                  {Number(entry.diaryDate.slice(8, 10))}
                </span>
                <GameCover
                  src={entry.game.coverUrl}
                  title={entry.game.title}
                  className="w-10 shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    href={`/games/${entry.game.slug}`}
                    className="font-medium hover:underline"
                  >
                    {entry.game.title}
                  </Link>
                  <LogDetails log={entry} />
                  {entry.reviewId !== null && (
                    <p className="text-xs text-muted-foreground">Reviewed</p>
                  )}
                </div>
                <Link
                  href={`/logs/${entry.id}/edit`}
                  className="text-sm underline"
                  aria-label={`Edit ${entry.game.title} log`}
                >
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {(page > 1 || hasMore) && (
        <nav aria-label="Diary pages" className="flex justify-between text-sm">
          {page > 1 ? (
            <Link
              href={page === 2 ? "/diary" : `/diary?page=${page - 1}`}
              className="underline"
            >
              Newer entries
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={`/diary?page=${page + 1}`} className="underline">
              Older entries
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
