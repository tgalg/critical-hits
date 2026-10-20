import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  backlogItems,
  gamePlatforms,
  games,
  logs,
  oneOffJobs,
  platforms,
  reviews,
  users,
} from "@/lib/db/schema";
import { parseImportText } from "@/lib/import/parse";
import { markDuplicates, matchEntries } from "@/lib/import/service";
import { recomputeGameRating } from "@/lib/logs/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;

// A play from a player's own records, with whatever detail they kept.
export type SeedPlay = {
  // Written as an import line: "Title" or "Title (release year)".
  title: string;
  year: number;
  // When the records give exact days; otherwise the play is spread over
  // its year like a pasted import.
  startedOn?: string;
  finishedOn?: string;
  rating?: number;
  hours?: number;
  // A platform name or abbreviation, used only if the game is on it.
  platform?: string;
  review?: string;
};

export type SeedResult =
  | { status: "done"; added: number; missing: string[]; moved?: number }
  | { status: "skipped"; reason: string };

// Loads a player's past plays once, as a one-off job named `job`. Like an
// import, the plays add no feed activity and skip any game the player
// already logged that year; unlike one, they carry ratings, hours,
// platforms and reviews, and only exact title matches count. The job is recorded in the same transaction, so a
// failed run leaves nothing behind and is tried again on the next deploy.
export async function seedPlays(
  db: Database,
  job: string,
  email: string,
  plays: SeedPlay[],
): Promise<SeedResult> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        sql`lower(${users.email}) = ${email.toLowerCase()}`,
        eq(users.emailVerified, true),
      ),
    );
  if (!user) return { status: "skipped", reason: "no verified user" };
  const [ran] = await db
    .select({ name: oneOffJobs.name })
    .from(oneOffJobs)
    .where(eq(oneOffJobs.name, job));
  if (ran) return { status: "skipped", reason: "already ran" };

  // Each year becomes a heading so year-only plays get spread dates.
  const byYear = new Map<number, SeedPlay[]>();
  for (const play of plays) {
    byYear.set(play.year, [...(byYear.get(play.year) ?? []), play]);
  }
  const ordered = [...byYear.values()].flat();
  const text = [...byYear]
    .map(([year, section]) => [year, ...section.map((p) => p.title)].join("\n"))
    .join("\n");
  const today = new Date().toISOString().slice(0, 10);
  const entries = parseImportText(text, today).map((entry) => {
    const play = ordered[entry.index];
    return {
      ...entry,
      finishedOn: play.finishedOn ?? entry.finishedOn,
    };
  });
  if (entries.length !== ordered.length) {
    throw new Error("Every seed play needs a title.");
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM users WHERE id = ${user.id} FOR NO KEY UPDATE`,
    );
    const inserted = await tx
      .insert(oneOffJobs)
      .values({ name: job })
      .onConflictDoNothing()
      .returning({ name: oneOffJobs.name });
    if (inserted.length === 0) {
      return { status: "skipped" as const, reason: "already ran" };
    }
    // Matches inside the transaction, after the user lock, so a play the
    // player logs meanwhile is seen as a duplicate.
    const matched = await matchEntries(tx as Database, user.id, entries);
    // Nobody checks the matches of a seed, so only exact titles count.
    const candidates = matched.filter((entry) => entry.match === "exact");
    const lockIds = [...new Set(candidates.map((entry) => entry.game!.id))];
    if (lockIds.length) {
      // Locks the games, in id order, then checks for duplicates again, so a
      // play logged from a game page meanwhile commits first and is seen.
      await tx.execute(
        sql`SELECT id FROM games WHERE id IN (${sql.join(
          lockIds.map((id) => sql`${id}`),
          sql`, `,
        )}) ORDER BY id FOR UPDATE`,
      );
    }
    const chosen = (
      await markDuplicates(tx as Database, user.id, candidates)
    ).filter((entry) => !entry.duplicate);
    const gameIds = [...new Set(chosen.map((entry) => entry.game!.id))];
    // Each game's earliest play by diary date, so a seeded play is a replay
    // only when the player had already played the game before it.
    const diaryDate = sql<string>`coalesce(${logs.finishedOn}, ${logs.startedOn}, (${logs.createdAt} AT TIME ZONE 'UTC')::date)::text`;
    const firstPlayed = new Map(
      gameIds.length
        ? (
            await tx
              .select({
                gameId: logs.gameId,
                first: sql<string>`min(${diaryDate})`,
              })
              .from(logs)
              .where(
                and(eq(logs.userId, user.id), inArray(logs.gameId, gameIds)),
              )
              .groupBy(logs.gameId)
          ).map((log) => [log.gameId, log.first])
        : [],
    );
    const reviewed = new Set(
      gameIds.length
        ? (
            await tx
              .select({ gameId: logs.gameId })
              .from(reviews)
              .innerJoin(logs, eq(logs.id, reviews.logId))
              .where(
                and(eq(logs.userId, user.id), inArray(logs.gameId, gameIds)),
              )
          ).map((log) => log.gameId)
        : [],
    );

    // Oldest first, so the first play of a game is the one that isn't a
    // replay and the latest rating is the one the game's average counts.
    chosen.sort(
      (a, b) =>
        (a.finishedOn ?? "9999").localeCompare(b.finishedOn ?? "9999") ||
        a.index - b.index,
    );
    for (const entry of chosen) {
      const play = ordered[entry.index];
      const gameId = entry.game!.id;
      const platformId = play.platform
        ? await findPlatform(tx as Database, gameId, play.platform)
        : null;
      const startedOn =
        play.startedOn && entry.finishedOn && play.startedOn <= entry.finishedOn
          ? play.startedOn
          : null;
      // Dated as when the play happened, so a game's average keeps counting
      // a newer play's rating over this older one's, and the review doesn't
      // pass for something just written.
      const playedAt = entry.finishedOn
        ? new Date(`${entry.finishedOn}T12:00:00Z`)
        : undefined;
      const day = entry.finishedOn ?? today;
      const first = firstPlayed.get(gameId);
      const [log] = await tx
        .insert(logs)
        .values({
          userId: user.id,
          gameId,
          platformId,
          status: "finished",
          startedOn,
          finishedOn: entry.finishedOn,
          hours: play.hours === undefined ? null : String(play.hours),
          rating: play.rating ?? null,
          isReplay: first !== undefined && first <= day,
          createdAt: playedAt,
        })
        .returning({ id: logs.id });
      if (first === undefined || day < first) {
        // The player's later plays of this game are replays now.
        await tx
          .update(logs)
          .set({ isReplay: true })
          .where(
            and(
              eq(logs.userId, user.id),
              eq(logs.gameId, gameId),
              eq(logs.isReplay, false),
              sql`${logs.id} <> ${log.id}`,
              sql`${diaryDate} > ${day}`,
            ),
          );
        firstPlayed.set(gameId, day);
      }
      // A player reviews a game once, on the first play that has one.
      if (play.review?.trim() && !reviewed.has(gameId)) {
        await tx.insert(reviews).values({
          logId: log.id,
          body: play.review.trim(),
          createdAt: playedAt,
        });
        reviewed.add(gameId);
      }
    }
    if (gameIds.length) {
      await tx
        .delete(backlogItems)
        .where(
          and(
            eq(backlogItems.userId, user.id),
            inArray(backlogItems.gameId, gameIds),
          ),
        );
      for (const gameId of gameIds) {
        await recomputeGameRating(tx as Database, gameId);
      }
    }
    return {
      status: "done" as const,
      added: chosen.length,
      missing: matched.filter((e) => e.match !== "exact").map((e) => e.line),
    };
  });
}

// Moves a player's plays of one game onto another edition of it, then adds
// one more finished play of that edition, once, as the one-off job `job`.
// Skips, to be tried again, until both games are in the catalog.
export async function moveToEdition(
  db: Database,
  job: string,
  email: string,
  {
    from,
    to,
    addFinishedOn,
  }: { from: string; to: string; addFinishedOn: string },
): Promise<SeedResult> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        sql`lower(${users.email}) = ${email.toLowerCase()}`,
        eq(users.emailVerified, true),
      ),
    );
  if (!user) return { status: "skipped", reason: "no verified user" };
  const editions = await db
    .select({ id: games.id, slug: games.slug })
    .from(games)
    .where(inArray(games.slug, [from, to]));
  const fromId = editions.find((game) => game.slug === from)?.id;
  const toId = editions.find((game) => game.slug === to)?.id;
  if (fromId === undefined || toId === undefined) {
    return { status: "skipped", reason: "edition not in the catalog" };
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM users WHERE id = ${user.id} FOR NO KEY UPDATE`,
    );
    // Waits until there's a play to move, so the job can't finish before
    // the plays it's for have been loaded.
    const [source] = await tx
      .select({ id: logs.id })
      .from(logs)
      .where(and(eq(logs.userId, user.id), eq(logs.gameId, fromId)))
      .limit(1);
    if (!source)
      return { status: "skipped" as const, reason: "no plays to move" };
    const inserted = await tx
      .insert(oneOffJobs)
      .values({ name: job })
      .onConflictDoNothing()
      .returning({ name: oneOffJobs.name });
    if (inserted.length === 0) {
      return { status: "skipped" as const, reason: "already ran" };
    }
    await tx.execute(
      sql`SELECT id FROM games WHERE id IN (${fromId}, ${toId}) ORDER BY id FOR UPDATE`,
    );
    const moved = await tx
      .update(logs)
      .set({ gameId: toId, platformId: null })
      .where(and(eq(logs.userId, user.id), eq(logs.gameId, fromId)))
      .returning({ id: logs.id });
    const diaryDate = sql`coalesce(${logs.finishedOn}, ${logs.startedOn}, (${logs.createdAt} AT TIME ZONE 'UTC')::date)`;
    const [sameYear] = await tx
      .select({ id: logs.id })
      .from(logs)
      .where(
        and(
          eq(logs.userId, user.id),
          eq(logs.gameId, toId),
          sql`extract(year from ${diaryDate}) = ${Number(addFinishedOn.slice(0, 4))}`,
        ),
      )
      .limit(1);
    const [earlier] = await tx
      .select({ id: logs.id })
      .from(logs)
      .where(
        and(
          eq(logs.userId, user.id),
          eq(logs.gameId, toId),
          sql`${diaryDate} < ${addFinishedOn}`,
        ),
      )
      .limit(1);
    // A play of that year already on the edition is the one to add.
    if (sameYear) {
      await tx
        .update(logs)
        .set({ isReplay: !!earlier })
        .where(eq(logs.id, sameYear.id));
    } else {
      await tx.insert(logs).values({
        userId: user.id,
        gameId: toId,
        status: "finished",
        finishedOn: addFinishedOn,
        isReplay: !!earlier,
        createdAt: new Date(`${addFinishedOn}T12:00:00Z`),
      });
    }
    await tx
      .delete(backlogItems)
      .where(
        and(eq(backlogItems.userId, user.id), eq(backlogItems.gameId, toId)),
      );
    await recomputeGameRating(tx as Database, fromId);
    await recomputeGameRating(tx as Database, toId);
    return {
      status: "done" as const,
      added: sameYear ? 0 : 1,
      missing: [],
      moved: moved.length,
    };
  });
}

async function findPlatform(db: Database, gameId: number, name: string) {
  const [platform] = await db
    .select({ id: platforms.id })
    .from(platforms)
    .innerJoin(gamePlatforms, eq(gamePlatforms.platformId, platforms.id))
    .where(
      and(
        eq(gamePlatforms.gameId, gameId),
        or(
          sql`lower(${platforms.name}) = ${name.toLowerCase()}`,
          sql`lower(${platforms.abbreviation}) = ${name.toLowerCase()}`,
        ),
      ),
    )
    .limit(1);
  return platform?.id ?? null;
}
