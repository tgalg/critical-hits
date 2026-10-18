import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameCover } from "@/components/catalog/game-cover";
import { getGameBySlug, releaseYear, starRating } from "@/lib/catalog/queries";
import { getDatabase } from "@/lib/db";
import { BacklogButton } from "@/components/backlog/backlog-button";
import { LogDetails } from "@/components/logs/log-details";
import { AddToList } from "@/components/lists/add-to-list";
import { FavouriteButton } from "@/components/profile/favourite-button";
import { GameReviews } from "@/components/logs/game-reviews";
import { LogForm } from "@/components/logs/log-form";
import { statusOptions } from "@/lib/logs/form-defaults";
import { getBacklogEntry } from "@/lib/backlog/service";
import { getUserLists } from "@/lib/lists/service";
import { getFavouriteIds } from "@/lib/profile/service";
import { getLikedIds } from "@/lib/social/likes";
import { getGameReviews, getUserLogsForGame } from "@/lib/logs/service";
import { getCurrentUser } from "@/lib/session";

export async function generateMetadata(
  props: PageProps<"/games/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const game = await getGameBySlug(getDatabase(), slug);
  return { title: game ? `${game.title} · Critical Hits` : "Game not found" };
}

export default async function GamePage(props: PageProps<"/games/[slug]">) {
  const { slug } = await props.params;
  const game = await getGameBySlug(getDatabase(), slug);
  if (!game) notFound();
  const stars = starRating(game.avgRating);
  const user = await getCurrentUser();
  const [plays, backlogEntry, lists, favouriteIds] = user
    ? await Promise.all([
        getUserLogsForGame(getDatabase(), user.id, game.id),
        getBacklogEntry(getDatabase(), user.id, game.id),
        getUserLists(getDatabase(), user.id),
        getFavouriteIds(getDatabase(), user.id),
      ])
    : [[], null, [], []];
  const reviews = await getGameReviews(getDatabase(), game.id);
  const likedReviews = await getLikedIds(
    getDatabase(),
    user?.id ?? null,
    "review",
    reviews.map((review) => review.id),
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href="/games"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Games
      </Link>
      <div className="mt-6 grid gap-8 sm:grid-cols-[200px_1fr]">
        <GameCover
          src={game.coverUrl}
          title={game.title}
          className="w-48 sm:w-full"
          priority
        />
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">
            {game.title}
            {game.releaseDate && (
              <span className="ml-3 text-2xl font-normal text-muted-foreground">
                {releaseYear(game.releaseDate)}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground">
            {stars === null
              ? "No ratings yet"
              : `★ ${stars} average from ${game.ratingCount} ${game.ratingCount === 1 ? "rating" : "ratings"}`}
          </p>
          {game.platforms.length > 0 && (
            <ul aria-label="Platforms" className="flex flex-wrap gap-2">
              {game.platforms.map((platform) => (
                <li
                  key={platform.name}
                  title={platform.name}
                  className="rounded-full border px-3 py-1 text-xs"
                >
                  {platform.abbreviation ?? platform.name}
                </li>
              ))}
            </ul>
          )}
          {game.summary && <p className="leading-relaxed">{game.summary}</p>}
          {user && (
            <BacklogButton
              gameId={game.id}
              slug={game.slug}
              platforms={game.platforms}
              entry={backlogEntry}
            />
          )}
          {user && (
            <AddToList gameId={game.id} slug={game.slug} lists={lists} />
          )}
          {user && (
            <FavouriteButton
              gameId={game.id}
              slug={game.slug}
              favouriteIds={favouriteIds}
            />
          )}
        </div>
      </div>

      <section aria-labelledby="your-plays" className="mt-12 space-y-6">
        <h2 id="your-plays" className="text-xl font-semibold">
          Your plays
        </h2>
        {user ? (
          <>
            {plays.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {plays.map((play) => (
                  <li
                    key={play.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-x-3">
                      <LogDetails log={play} />
                      {play.reviewId !== null && (
                        <span className="text-sm text-muted-foreground">
                          Reviewed
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/logs/${play.id}/edit`}
                      className="text-sm underline"
                    >
                      Edit
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-lg border p-6">
              <h3 className="mb-4 font-medium">
                {plays.length > 0 ? "Log another play" : "Log this game"}
              </h3>
              <LogForm
                gameId={game.id}
                slug={game.slug}
                platforms={game.platforms}
                statuses={statusOptions}
                submitLabel="Save log"
              />
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">
            <Link href="/sign-in" className="underline">
              Sign in
            </Link>{" "}
            to log this game.
          </p>
        )}
      </section>

      <section aria-labelledby="reviews" className="mt-12 space-y-6">
        <h2 id="reviews" className="text-xl font-semibold">
          Reviews
        </h2>
        <GameReviews
          reviews={reviews}
          viewerId={user?.id ?? null}
          liked={likedReviews}
          path={`/games/${game.slug}`}
        />
      </section>
    </main>
  );
}
