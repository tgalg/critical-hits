import Link from "next/link";
import { GameCover } from "@/components/catalog/game-cover";
import { ReviewBody } from "@/components/logs/game-reviews";
import { stars, statusLabels, type LogStatus } from "@/lib/logs/input";

const timeFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

type Entry = {
  id: number;
  verb: "logged" | "reviewed" | "created_list";
  createdAt: Date;
  actor: string;
  log: {
    status: LogStatus;
    rating: number | null;
    hearted: boolean;
    isReplay: boolean;
  } | null;
  review: { body: string; containsSpoilers: boolean } | null;
  reviewRating: number | null;
  list: { id: number; title: string } | null;
  game: { slug: string; title: string; coverUrl: string | null } | null;
};

function Rating({ rating }: { rating: number | null }) {
  if (rating === null) return null;
  return (
    <span className="text-primary" aria-label={`Rated ${rating / 2} out of 5`}>
      {stars(rating)}
    </span>
  );
}

function Summary({ entry }: { entry: Entry }) {
  const actor = (
    <Link href={`/u/${entry.actor}`} className="font-medium hover:underline">
      {entry.actor}
    </Link>
  );
  const game = entry.game && (
    <Link
      href={`/games/${entry.game.slug}`}
      className="font-medium hover:underline"
    >
      {entry.game.title}
    </Link>
  );
  if (entry.list) {
    return (
      <>
        {actor} made a list:{" "}
        <Link
          href={`/lists/${entry.list.id}`}
          className="font-medium hover:underline"
        >
          {entry.list.title}
        </Link>
      </>
    );
  }
  if (entry.review) {
    return (
      <>
        {actor} reviewed {game} <Rating rating={entry.reviewRating} />
      </>
    );
  }
  const log = entry.log!;
  return (
    <>
      {actor} {log.isReplay ? "replayed" : "logged"} {game}{" "}
      <span className="text-muted-foreground">
        ({statusLabels[log.status].toLowerCase()})
      </span>{" "}
      <Rating rating={log.rating} />
      {log.hearted && (
        <span className="text-red-500" aria-label="Favourite">
          {" "}
          ♥
        </span>
      )}
    </>
  );
}

export function Feed({ entries }: { entries: Entry[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-4 p-4">
          {entry.game && (
            <GameCover
              src={entry.game.coverUrl}
              title={entry.game.title}
              className="w-10 shrink-0"
            />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm">
              <Summary entry={entry} />
            </p>
            {entry.review &&
              (entry.review.containsSpoilers ? (
                <details>
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    This review contains spoilers. Show it
                  </summary>
                  <div className="mt-2 text-sm">
                    <ReviewBody body={entry.review.body} />
                  </div>
                </details>
              ) : (
                <div className="line-clamp-4 text-sm">
                  <ReviewBody body={entry.review.body} />
                </div>
              ))}
            <time
              dateTime={entry.createdAt.toISOString()}
              className="block text-xs text-muted-foreground"
            >
              {timeFormat.format(entry.createdAt)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}
