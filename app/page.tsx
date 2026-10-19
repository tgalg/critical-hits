import Link from "next/link";
import { GameRow } from "@/components/catalog/game-row";
import { GameReviews } from "@/components/logs/game-reviews";
import { Feed } from "@/components/social/feed";
import { PlayerSearch } from "@/components/social/player-search";
import { SparkMark, Wordmark } from "@/components/brand";
import { Card, CardContent } from "@/components/ui/card";
import { getBrowseRows, type BrowseRow } from "@/lib/catalog/queries";
import { getDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getLikedIds } from "@/lib/social/likes";
import { getFeed, getPopularReviews } from "@/lib/social/service";

// Rows of games open the home page, so there is something to log before the
// site has many players; the feed of people you follow comes after them.
function GameRows({ rows }: { rows: BrowseRow[] }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-3xl font-semibold tracking-tight">
          Find something to play
        </h2>
        <Link href="/games" className="text-sm underline">
          Search games
        </Link>
      </div>
      {rows.map((row) => (
        <GameRow key={row.id} row={row} />
      ))}
    </div>
  );
}

// Signed-in players get games to log and the feed of people they follow;
// everyone else gets the landing page with the same games.
export default async function Home(props: PageProps<"/">) {
  const user = await getCurrentUser();
  if (user) {
    const { page: pageParam } = await props.searchParams;
    const requested = Number(pageParam);
    const page =
      Number.isSafeInteger(requested) && requested > 1 ? requested : 1;
    const { entries, hasMore } = await getFeed(getDatabase(), user.id, page);
    const empty = entries.length === 0 && page === 1;
    // Older feed pages are for reading the feed, so they skip the games.
    const rows = page === 1 ? await getBrowseRows(getDatabase()) : [];
    // An empty feed shows what the community likes instead.
    const popular = empty
      ? await getPopularReviews(getDatabase(), user.id)
      : [];
    const ids = (
      pick: (entry: (typeof entries)[number]) => number | undefined,
    ) => entries.map(pick).filter((id): id is number => id !== undefined);
    const [likedReviews, likedLists] = await Promise.all([
      getLikedIds(getDatabase(), user.id, "review", [
        ...ids((e) => e.review?.id),
        ...popular.map((review) => review.id),
      ]),
      getLikedIds(
        getDatabase(),
        user.id,
        "list",
        ids((e) => e.list?.id),
      ),
    ]);
    return (
      <main className="mx-auto max-w-5xl space-y-12 px-6 py-12">
        <h1 className="sr-only">Home</h1>
        {rows.length > 0 && <GameRows rows={rows} />}
        <section className="max-w-2xl space-y-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-3xl font-semibold tracking-tight">
              From players you follow
            </h2>
            <Link href="/players" className="text-sm underline">
              Find players
            </Link>
          </div>
          {empty ? (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Nothing here yet. Follow players to see what they play, review
                and collect.
              </p>
              <PlayerSearch />
              {popular.length > 0 && (
                <section aria-labelledby="popular" className="space-y-4 pt-4">
                  <h3 id="popular" className="text-xl font-semibold">
                    Popular reviews
                  </h3>
                  <GameReviews
                    reviews={popular}
                    viewerId={user.id}
                    liked={likedReviews}
                    path="/"
                  />
                </section>
              )}
            </div>
          ) : (
            <Feed
              entries={entries}
              viewerId={user.id}
              likedReviews={likedReviews}
              likedLists={likedLists}
            />
          )}
          {(page > 1 || hasMore) && (
            <nav
              aria-label="Feed pages"
              className="flex justify-between text-sm"
            >
              {page > 1 ? (
                <Link
                  href={page === 2 ? "/" : `/?page=${page - 1}`}
                  className="underline"
                >
                  Newer
                </Link>
              ) : (
                <span />
              )}
              {hasMore && (
                <Link href={`/?page=${page + 1}`} className="underline">
                  Older
                </Link>
              )}
            </nav>
          )}
        </section>
      </main>
    );
  }
  const rows = await getBrowseRows(getDatabase());
  return (
    <main className="mx-auto flex max-w-5xl flex-col items-center gap-16 px-6 py-16">
      <Card className="w-full max-w-2xl">
        <CardContent className="space-y-6 p-8 sm:p-12">
          <p className="text-sm font-medium tracking-widest text-primary uppercase">
            Your next favorite game starts here
          </p>
          <h1 className="flex items-center gap-3 text-5xl leading-none sm:text-6xl">
            <SparkMark className="size-12 sm:size-14" />
            <Wordmark />
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
            Keep a diary of the games you play. Share your reviews, build your
            backlog, and discover what your friends are playing.
          </p>
          <div className="flex gap-3 text-sm font-medium">
            <Link
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
              href="/sign-up"
            >
              Create an account
            </Link>
            <Link className="rounded-md border px-4 py-2" href="/games">
              Browse games
            </Link>
            <Link className="rounded-md border px-4 py-2" href="/sign-in">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
      {rows.length > 0 && (
        <div className="w-full">
          <GameRows rows={rows} />
        </div>
      )}
    </main>
  );
}
