import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { GameCover } from "@/components/catalog/game-cover";
import { ReviewBody } from "@/components/logs/game-reviews";
import { LogDetails } from "@/components/logs/log-details";
import { getDatabase } from "@/lib/db";
import { stars } from "@/lib/logs/input";
import { getProfile, maxFavourites } from "@/lib/profile/service";
import { getCurrentUser } from "@/lib/session";
import { getFollowState } from "@/lib/social/service";
import { FollowButton } from "@/components/social/follow-button";
import { ReportButton } from "@/components/moderation/report-button";
import { LikeButton } from "@/components/social/like-button";
import { getLikedIds } from "@/lib/social/likes";

// Metadata and the page share one load per request. Next.js has already
// decoded the username segment.
const loadProfile = cache((username: string) =>
  getProfile(getDatabase(), username, new Date().getUTCFullYear()),
);

export async function generateMetadata(
  props: PageProps<"/u/[username]">,
): Promise<Metadata> {
  const profile = await loadProfile((await props.params).username);
  return {
    title: profile
      ? `${profile.user.displayName || profile.user.username} · Critical Hits`
      : "Player not found",
  };
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h2
        id={id}
        className="text-sm font-medium tracking-widest text-muted-foreground uppercase"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function ProfilePage(props: PageProps<"/u/[username]">) {
  const profile = await loadProfile((await props.params).username);
  if (!profile) notFound();
  const viewer = await getCurrentUser();
  const own = viewer?.id === profile.user.id;
  const [followState, likedReviews] = await Promise.all([
    getFollowState(getDatabase(), profile.user.id, viewer?.id ?? null),
    getLikedIds(
      getDatabase(),
      viewer?.id ?? null,
      "review",
      profile.recentReviews.map((review) => review.id),
    ),
  ]);
  const { user, stats } = profile;
  const statItems = [
    { label: "Games played", value: stats.gamesPlayed },
    {
      label: `Finished in ${new Date().getUTCFullYear()}`,
      value: stats.finishedThisYear,
    },
    { label: "Hours", value: Number(stats.hours) },
    { label: "Reviews", value: stats.reviews },
  ];

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {user.displayName || user.username}
        </h1>
        <p className="text-sm text-muted-foreground">@{user.username}</p>
        {user.bio && (
          <p className="leading-relaxed whitespace-pre-line">{user.bio}</p>
        )}
        <p className="text-sm text-muted-foreground">
          {followState.followers}{" "}
          {followState.followers === 1 ? "follower" : "followers"} ·{" "}
          {followState.following} following
        </p>
        {own ? (
          <Link href="/account" className="text-sm underline">
            Edit profile
          </Link>
        ) : (
          viewer && (
            <FollowButton
              userId={profile.user.id}
              following={followState.viewerFollows}
            />
          )
        )}
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statItems.map((item) => (
          <div key={item.label} className="rounded-lg border p-4">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {item.value.toLocaleString("en")}
            </dd>
          </div>
        ))}
      </dl>

      <Section id="favourites" title="Favourite four">
        {profile.favourites.length === 0 ? (
          <p className="text-muted-foreground">
            {own
              ? `Pick up to ${maxFavourites} favourites from any game's page.`
              : "No favourites picked yet."}
          </p>
        ) : (
          <ul className="grid grid-cols-4 gap-3">
            {profile.favourites.map((game) => (
              <li key={game.id}>
                <Link href={`/games/${game.slug}`} title={game.title}>
                  <GameCover src={game.coverUrl} title={game.title} />
                  <span className="sr-only">{game.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="recent" title="Recent plays">
        {profile.recentLogs.length === 0 ? (
          <p className="text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {profile.recentLogs.map((log) => (
              <li key={log.id} className="flex items-center gap-4 p-3">
                <GameCover
                  src={log.game.coverUrl}
                  title={log.game.title}
                  className="w-10 shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    href={`/games/${log.game.slug}`}
                    className="font-medium hover:underline"
                  >
                    {log.game.title}
                  </Link>
                  <LogDetails log={log} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="reviews" title="Reviews">
        {profile.recentReviews.length === 0 ? (
          <p className="text-muted-foreground">No reviews yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {profile.recentReviews.map((review) => (
              <li key={review.id} className="space-y-2 p-4">
                <p className="flex flex-wrap items-center gap-x-3 text-sm">
                  <Link
                    href={`/games/${review.game.slug}`}
                    className="font-medium hover:underline"
                  >
                    {review.game.title}
                  </Link>
                  {review.rating !== null && (
                    <span
                      className="text-primary"
                      aria-label={`Rated ${review.rating / 2} out of 5`}
                    >
                      {stars(review.rating)}
                    </span>
                  )}
                </p>
                {review.containsSpoilers ? (
                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      This review contains spoilers. Show it
                    </summary>
                    <div className="mt-2">
                      <ReviewBody body={review.body} />
                    </div>
                  </details>
                ) : (
                  <ReviewBody body={review.body} />
                )}
                <div className="flex flex-wrap items-start gap-4">
                  <LikeButton
                    type="review"
                    id={review.id}
                    count={review.likeCount}
                    liked={likedReviews.has(review.id)}
                    canLike={!!viewer && !own}
                    path={`/u/${user.username}`}
                    label={`review of ${review.game.title}`}
                  />
                  {viewer && !own && (
                    <ReportButton
                      reviewId={review.id}
                      label={`review of ${review.game.title}`}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="lists" title="Lists">
        {profile.lists.length === 0 ? (
          <p className="text-muted-foreground">No public lists yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {profile.lists.map((list) => (
              <li
                key={list.id}
                className="flex items-center justify-between gap-2 p-4"
              >
                <Link
                  href={`/lists/${list.id}`}
                  className="font-medium hover:underline"
                >
                  {list.title}
                </Link>
                <span className="text-sm text-muted-foreground">
                  {list.gameCount} {list.gameCount === 1 ? "game" : "games"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="backlog" title={`Backlog (${stats.backlog})`}>
        {profile.backlog.length === 0 ? (
          <p className="text-muted-foreground">Nothing queued up.</p>
        ) : (
          <ol className="grid grid-cols-5 gap-3">
            {profile.backlog.map((entry) => (
              <li key={entry.gameId}>
                <Link
                  href={`/games/${entry.game.slug}`}
                  title={entry.game.title}
                >
                  <GameCover
                    src={entry.game.coverUrl}
                    title={entry.game.title}
                  />
                  <span className="sr-only">{entry.game.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </main>
  );
}
