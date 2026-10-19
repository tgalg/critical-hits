import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { backlogItems, games, logs } from "@/lib/db/schema";
import { normaliseTitle, type ImportEntry } from "@/lib/import/parse";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// How alike a title must be (pg_trgm similarity, 0-1) to count as a close
// match when no catalog title matches exactly.
const closeMatchSimilarity = 0.4;

export type MatchedEntry = ImportEntry & {
  game: {
    id: number;
    slug: string;
    title: string;
    releaseDate: string | null;
  } | null;
  // Exact means the title matched ignoring case and punctuation.
  match: "exact" | "close" | "none";
  // The same game is already logged, or listed earlier, as finished in the
  // same year.
  duplicate: boolean;
};

const gameColumns = {
  id: games.id,
  slug: games.slug,
  title: games.title,
  releaseDate: games.releaseDate,
};

// The SQL side of normaliseTitle: decompose, drop the combining accents,
// then keep only letters and digits.
const normalisedTitle = sql`trim(regexp_replace(regexp_replace(normalize(lower(${games.title}), NFD), '[\u0300-\u036f]', '', 'g'), '[^a-z0-9]+', ' ', 'g'))`;

const releaseYearIs = (year: number | null) =>
  year === null
    ? sql`true`
    : sql`extract(year from ${games.releaseDate}) = ${year}`;

async function findGame(db: Database, entry: ImportEntry) {
  const normalised = normaliseTitle(entry.title);
  // Among games sharing a title, the one most players know is the likelier.
  const [exact] =
    normalised === null
      ? []
      : await db
          .select(gameColumns)
          .from(games)
          .where(
            and(
              sql`${normalisedTitle} = ${normalised}`,
              releaseYearIs(entry.releaseYear),
            ),
          )
          .orderBy(sql`${games.igdbRatingCount} desc`, games.id)
          .limit(1);
  if (exact) return { game: exact, match: "exact" as const };
  const [close] = await db
    .select(gameColumns)
    .from(games)
    .where(
      and(
        sql`similarity(${games.title}, ${entry.title}) >= ${closeMatchSimilarity}`,
        releaseYearIs(entry.releaseYear),
      ),
    )
    .orderBy(
      sql`similarity(${games.title}, ${entry.title}) desc`,
      sql`${games.igdbRatingCount} desc`,
      games.id,
    )
    .limit(1);
  if (close) return { game: close, match: "close" as const };
  return { game: null, match: "none" as const };
}

// Matches every entry to a catalog game and marks the ones that would be
// imported twice.
export async function matchEntries(
  db: Database,
  userId: string,
  entries: ImportEntry[],
): Promise<MatchedEntry[]> {
  // Run together; the connection pool queues them, so a long list takes a
  // few pooled round trips per batch rather than one after another.
  const matched: MatchedEntry[] = await Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      ...(await findGame(db, entry)),
      duplicate: false,
    })),
  );
  return markDuplicates(db, userId, matched);
}

// A play counts once per game per year: the dates of year-only entries
// move when the list changes, so comparing days would import them again.
// Existing plays use the diary's year, which falls back from the finish
// date to the start date to the day the log was written.
async function markDuplicates(
  db: Database | Transaction,
  userId: string,
  entries: MatchedEntry[],
) {
  const gameIds = [
    ...new Set(entries.flatMap((entry) => (entry.game ? [entry.game.id] : []))),
  ];
  const existing = gameIds.length
    ? await db
        .select({
          gameId: logs.gameId,
          year: sql<string>`extract(year from coalesce(${logs.finishedOn}, ${logs.startedOn}, (${logs.createdAt} AT TIME ZONE 'UTC')::date))::text`,
        })
        .from(logs)
        .where(and(eq(logs.userId, userId), inArray(logs.gameId, gameIds)))
    : [];
  const currentYear = new Date().getUTCFullYear();
  const seen = new Set(existing.map((log) => `${log.gameId}:${log.year}`));
  for (const entry of entries) {
    if (!entry.game) continue;
    // An undated play lands in the diary on the day it's imported.
    const year = entry.finishedOn?.slice(0, 4) ?? String(currentYear);
    const key = `${entry.game.id}:${year}`;
    entry.duplicate = seen.has(key);
    seen.add(key);
  }
  return entries;
}

// Logs the chosen entries as finished plays. Imported history is the past,
// so it adds no `logged` activities and doesn't fill followers' feeds. A
// game the player already has a play of is marked as a replay. Returns how
// many plays were added.
export async function importEntries(
  db: Database,
  userId: string,
  entries: MatchedEntry[],
) {
  const candidates = entries
    .filter((entry) => entry.game)
    .sort(
      (a, b) =>
        // Undated plays land on today, after every dated one.
        (a.finishedOn ?? "9999").localeCompare(b.finishedOn ?? "9999") ||
        a.index - b.index,
    )
    .map((entry) => ({ ...entry }));
  if (candidates.length === 0) return 0;
  return db.transaction(async (tx) => {
    // Locks the player so two imports at once run one after the other, and
    // the second sees the first's plays when it checks for duplicates. NO KEY
    // leaves the row's key free for createLog's foreign-key checks.
    await tx.execute(
      sql`SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE`,
    );
    // Locks the games too, in id order, so a play being logged from a game
    // page commits before the duplicate check below and is seen by it.
    await tx.execute(
      sql`SELECT id FROM games WHERE id IN (${sql.join(
        [...new Set(candidates.map((entry) => entry.game!.id))].map(
          (id) => sql`${id}`,
        ),
        sql`, `,
      )}) ORDER BY id FOR UPDATE`,
    );
    const chosen = (await markDuplicates(tx, userId, candidates)).filter(
      (entry) => !entry.duplicate,
    );
    if (chosen.length === 0) return 0;
    const gameIds = [...new Set(chosen.map((entry) => entry.game!.id))];
    const played = new Set(
      (
        await tx
          .select({ gameId: logs.gameId })
          .from(logs)
          .where(and(eq(logs.userId, userId), inArray(logs.gameId, gameIds)))
      ).map((log) => log.gameId),
    );
    const rows = chosen.map((entry) => {
      const gameId = entry.game!.id;
      const isReplay = played.has(gameId);
      played.add(gameId);
      return {
        userId,
        gameId,
        status: "finished" as const,
        finishedOn: entry.finishedOn,
        isReplay,
      };
    });
    await tx.insert(logs).values(rows);
    // Logging a game takes it off the player's backlog.
    await tx
      .delete(backlogItems)
      .where(
        and(
          eq(backlogItems.userId, userId),
          inArray(backlogItems.gameId, gameIds),
        ),
      );
    return rows.length;
  });
}
