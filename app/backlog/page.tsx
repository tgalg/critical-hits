import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  moveBacklogAction,
  removeFromBacklogAction,
} from "@/app/backlog/actions";
import { GameCover } from "@/components/catalog/game-cover";
import { getBacklog, getBacklogPlatforms } from "@/lib/backlog/service";
import { getDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Your backlog · Critical Hits" };

const smallButton =
  "rounded border px-2 py-1 text-xs disabled:opacity-40 hover:bg-muted";

export default async function BacklogPage(props: PageProps<"/backlog">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { platform } = await props.searchParams;
  const requested = Number(platform);
  const platformId =
    Number.isSafeInteger(requested) && requested > 0 ? requested : null;
  const [entries, platforms] = await Promise.all([
    getBacklog(getDatabase(), user.id, platformId),
    getBacklogPlatforms(getDatabase(), user.id),
  ]);
  // Reordering a filtered view would swap with hidden neighbours, so moves are
  // offered only on the full list.
  const filtered = platformId !== null;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Your backlog</h1>

      {platforms.length > 0 && (
        <form action="/backlog" className="flex items-center gap-2 text-sm">
          <label htmlFor="platform">Platform</label>
          <select
            id="platform"
            name="platform"
            defaultValue={platformId ?? ""}
            className="rounded-md border bg-background px-3 py-2"
          >
            <option value="">All platforms</option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md border px-3 py-2">
            Filter
          </button>
        </form>
      )}

      {entries.length === 0 && (
        <p className="text-muted-foreground">
          {filtered ? (
            "Nothing in your backlog on that platform."
          ) : (
            <>
              Your backlog is empty.{" "}
              <Link href="/games" className="underline">
                Find a game
              </Link>{" "}
              you want to play.
            </>
          )}
        </p>
      )}

      {entries.length > 0 && (
        <ol className="divide-y rounded-lg border">
          {entries.map((entry, index) => (
            <li key={entry.gameId} className="flex items-center gap-4 p-3">
              <span className="w-6 text-center text-sm text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <GameCover
                src={entry.game.coverUrl}
                title={entry.game.title}
                className="w-10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/games/${entry.game.slug}`}
                  className="font-medium hover:underline"
                >
                  {entry.game.title}
                </Link>
                {entry.platform && (
                  <p className="text-sm text-muted-foreground">
                    {entry.platform}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                {!filtered &&
                  (["up", "down"] as const).map((direction) => (
                    <form key={direction} action={moveBacklogAction}>
                      <input type="hidden" name="gameId" value={entry.gameId} />
                      <input type="hidden" name="direction" value={direction} />
                      <button
                        type="submit"
                        className={smallButton}
                        disabled={
                          direction === "up"
                            ? index === 0
                            : index === entries.length - 1
                        }
                        aria-label={`Move ${entry.game.title} ${direction}`}
                      >
                        {direction === "up" ? "↑" : "↓"}
                      </button>
                    </form>
                  ))}
                <form action={removeFromBacklogAction}>
                  <input type="hidden" name="gameId" value={entry.gameId} />
                  <input type="hidden" name="slug" value={entry.game.slug} />
                  <button
                    type="submit"
                    className={smallButton}
                    aria-label={`Remove ${entry.game.title}`}
                  >
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
