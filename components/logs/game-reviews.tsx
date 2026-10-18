import Link from "next/link";
import { ReportButton } from "@/components/moderation/report-button";
import { LikeButton } from "@/components/social/like-button";
import { stars } from "@/lib/logs/input";

const dateFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

type Review = {
  id: number;
  author: string;
  rating: number | null;
  createdAt: Date;
  body: string;
  containsSpoilers: boolean;
  likeCount: number;
  authorId: string;
  // Set where reviews of several games are listed together.
  game?: { slug: string; title: string };
};

// Plain text with the writer's line breaks; no HTML or Markdown.
export function ReviewBody({ body }: { body: string }) {
  return <p className="leading-relaxed whitespace-pre-line">{body}</p>;
}

export function GameReviews({
  reviews,
  viewerId,
  liked,
  path,
}: {
  reviews: Review[];
  viewerId: string | null;
  liked: Set<number>;
  path: string;
}) {
  if (reviews.length === 0) {
    return <p className="text-muted-foreground">No reviews yet.</p>;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {reviews.map((review) => (
        <li key={review.id} className="space-y-2 p-4">
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <Link
              href={`/u/${review.author}`}
              className="font-medium text-foreground hover:underline"
            >
              {review.author}
            </Link>
            {review.game && (
              <Link
                href={`/games/${review.game.slug}`}
                className="text-foreground hover:underline"
              >
                {review.game.title}
              </Link>
            )}
            {review.rating !== null && (
              <span
                className="text-primary"
                aria-label={`Rated ${review.rating / 2} out of 5`}
              >
                {stars(review.rating)}
              </span>
            )}
            <time dateTime={review.createdAt.toISOString()}>
              {dateFormat.format(review.createdAt)}
            </time>
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
              liked={liked.has(review.id)}
              canLike={viewerId !== null && viewerId !== review.authorId}
              path={path}
              label={`${review.author}'s review`}
            />
            {viewerId !== null && viewerId !== review.authorId && (
              <ReportButton
                reviewId={review.id}
                label={`${review.author}'s review`}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
