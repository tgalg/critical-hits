import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { removeLog } from "@/app/logs/actions";
import { LogForm } from "@/components/logs/log-form";
import { getGameBySlug } from "@/lib/catalog/queries";
import { getDatabase } from "@/lib/db";
import { logFormDefaults, statusOptions } from "@/lib/logs/form-defaults";
import { getOwnedLog, getUserLogsForGame } from "@/lib/logs/service";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Edit log · Critical Hits" };

export default async function EditLogPage(props: PageProps<"/logs/[id]/edit">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { id } = await props.params;
  const logId = Number(id);
  // Another player's log is reported as missing, not forbidden.
  const log = Number.isSafeInteger(logId)
    ? await getOwnedLog(getDatabase(), user.id, logId)
    : null;
  if (!log) notFound();
  const game = await getGameBySlug(getDatabase(), log.game.slug);
  if (!game) notFound();
  // The game's review may sit on another of the player's plays.
  const reviewedLogId = log.review
    ? null
    : ((await getUserLogsForGame(getDatabase(), user.id, game.id)).find(
        (play) => play.reviewId !== null,
      )?.id ?? null);

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      <Link
        href={`/games/${game.slug}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {game.title}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">
        Edit your {game.title} log
      </h1>
      {log.reviewHidden && (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          A moderator hid your review of this play, so other players can&apos;t
          see it. You can still edit or delete it here.
        </p>
      )}
      <LogForm
        logId={log.id}
        slug={game.slug}
        platforms={game.platforms}
        statuses={statusOptions}
        defaults={logFormDefaults(log)}
        reviewedLogId={reviewedLogId}
        submitLabel="Save changes"
      />
      <form action={removeLog} className="border-t pt-6">
        <input type="hidden" name="logId" value={log.id} />
        <input type="hidden" name="slug" value={game.slug} />
        <button type="submit" className="text-sm text-destructive underline">
          Delete this log
        </button>
      </form>
    </main>
  );
}
