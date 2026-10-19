import Link from "next/link";
import { GameReviews } from "@/components/logs/game-reviews";
import { Feed } from "@/components/social/feed";
import { PlayerSearch } from "@/components/social/player-search";
import { SparkMark, Wordmark } from "@/components/brand";
import { Card, CardContent } from "@/components/ui/card";
import { getDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getLikedIds } from "@/lib/social/likes";
import { getFeed, getPopularReviews } from "@/lib/social/service";

// Signed-in players get the feed of people they follow; everyone else gets
// the landing page.
export default async function Home(props: PageProps<"/">) {
  const user = await getCurrentUser();
  if (user) {
    const { page: pageParam } = await props.searchParams;
    const requested = Number(pageParam);
    const page =
      Number.isSafeInteger(requested) && requested > 1 ? requested : 1;
    const { entries, hasMore } = await getFeed(getDatabase(), user.id, page);
    const empty = entries.length === 0 && page === 1;
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
      <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            From players you follow
          </h1>
          <Link href="/players" className="text-sm underline">
            Find players
          </Link>
        </div>
        {empty ? (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Nothing here yet. Follow players to see what they play, review and
              collect.
            </p>
            <PlayerSearch />
            {popular.length > 0 && (
              <section aria-labelledby="popular" className="space-y-4 pt-4">
                <h2 id="popular" className="text-xl font-semibold">
                  Popular reviews
                </h2>
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
          <nav aria-label="Feed pages" className="flex justify-between text-sm">
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
      </main>
    );
  }
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-16">
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
    </main>
  );
}
