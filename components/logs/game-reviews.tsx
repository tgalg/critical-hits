import Link from "next/link";
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
};

// Plain text with the writer's line breaks; no HTML or Markdown.
export function ReviewBody({ body }: { body: string }) {
  return <p className="leading-relaxed whitespace-pre-line">{body}</p>;
}

export function GameReviews({ reviews }: { reviews: Review[] }) {
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
        </li>
      ))}
    </ul>
  );
}
