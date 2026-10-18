import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { removeLog } from "@/app/logs/actions";
import { LogForm } from "@/components/logs/log-form";
import { getGameBySlug } from "@/lib/catalog/queries";
import { getDatabase } from "@/lib/db";
import { logFormDefaults, statusOptions } from "@/lib/logs/form-defaults";
import { getOwnedLog } from "@/lib/logs/service";
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
      <LogForm
        logId={log.id}
        slug={game.slug}
        platforms={game.platforms}
        statuses={statusOptions}
        defaults={logFormDefaults(log)}
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
