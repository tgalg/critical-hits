import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  dismissReportsAction,
  hideReviewAction,
  unhideReviewAction,
} from "@/app/admin/actions";
import { ReviewBody } from "@/components/logs/game-reviews";
import { getDatabase } from "@/lib/db";
import { reasonLabels } from "@/lib/moderation/reasons";
import { getHiddenReviews, getOpenReports } from "@/lib/moderation/service";
import { getCurrentAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Moderation · Critical Hits" };

const dateFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const button = "rounded-md border px-3 py-1.5 text-sm hover:bg-muted";

function ReviewAction({
  reviewId,
  action,
  label,
  accessibleLabel,
}: {
  reviewId: number;
  action: (form: FormData) => Promise<void>;
  label: string;
  accessibleLabel: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="reviewId" value={reviewId} />
      <button type="submit" className={button} aria-label={accessibleLabel}>
        {label}
      </button>
    </form>
  );
}

function ReviewHeading({
  review,
}: {
  review: { author: string; game: { slug: string; title: string } };
}) {
  return (
    <p className="text-sm text-muted-foreground">
      <Link
        href={`/u/${review.author}`}
        className="font-medium text-foreground hover:underline"
      >
        {review.author}
      </Link>{" "}
      on{" "}
      <Link href={`/games/${review.game.slug}`} className="hover:underline">
        {review.game.title}
      </Link>
    </p>
  );
}

// Moderators only; everyone else gets the site's 404.
export default async function AdminPage() {
  if (!(await getCurrentAdmin())) notFound();
  const [open, hidden] = await Promise.all([
    getOpenReports(getDatabase()),
    getHiddenReviews(getDatabase()),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Moderation</h1>

      <section aria-labelledby="reported" className="space-y-4">
        <h2 id="reported" className="text-xl font-semibold">
          Reported reviews
        </h2>
        {open.length === 0 ? (
          <p className="text-muted-foreground">Nothing to review.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {open.map((review) => (
              <li key={review.id} className="space-y-3 p-4">
                <ReviewHeading review={review} />
                <ReviewBody body={review.body} />
                <p className="text-sm text-muted-foreground">
                  {review.reportCount}{" "}
                  {review.reportCount === 1 ? "report" : "reports"}:{" "}
                  {review.reasons.map((r) => reasonLabels[r]).join(", ")}. First
                  reported {dateFormat.format(review.firstReported)}.
                  {review.containsSpoilers && " Marked as spoilers."}
                </p>
                <div className="flex gap-2">
                  <ReviewAction
                    reviewId={review.id}
                    action={hideReviewAction}
                    label="Hide review"
                    accessibleLabel={`Hide ${review.author}'s review of ${review.game.title}`}
                  />
                  <ReviewAction
                    reviewId={review.id}
                    action={dismissReportsAction}
                    label="Dismiss"
                    accessibleLabel={`Dismiss reports on ${review.author}'s review of ${review.game.title}`}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="hidden" className="space-y-4">
        <h2 id="hidden" className="text-xl font-semibold">
          Hidden reviews
        </h2>
        {hidden.length === 0 ? (
          <p className="text-muted-foreground">No hidden reviews.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {hidden.map((review) => (
              <li key={review.id} className="space-y-3 p-4">
                <ReviewHeading review={review} />
                <ReviewBody body={review.body} />
                <ReviewAction
                  reviewId={review.id}
                  action={unhideReviewAction}
                  label="Restore"
                  accessibleLabel={`Restore ${review.author}'s review of ${review.game.title}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
