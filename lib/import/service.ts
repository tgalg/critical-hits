import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { backlogItems, games, logs } from "@/lib/db/schema";
import { normaliseTitle, type ImportEntry } from "@/lib/import/parse";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;

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

// The SQL side of normaliseTitle, for the accents catalog titles use.
const normalisedTitle = sql`trim(regexp_replace(translate(lower(${games.title}), 'áàâäãåéèêëíìîïóòôöõúùûüñç', 'aaaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]+', ' ', 'g'))`;

const releaseYearIs = (year: number | null) =>
  year === null
    ? sql`true`
    : sql`extract(year from ${games.releaseDate}) = ${year}`;

async function findGame(db: Database, entry: ImportEntry) {
  const normalised = normaliseTitle(entry.title);
  // Among games sharing a title, the one most players know is the likelier.
  const [exact] = await db
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
  const matched: MatchedEntry[] = [];
  for (const entry of entries) {
    matched.push({
      ...entry,
      ...(await findGame(db, entry)),
      duplicate: false,
    });
  }
  const gameIds = [
    ...new Set(matched.flatMap((entry) => (entry.game ? [entry.game.id] : []))),
  ];
  const existing = gameIds.length
    ? await db
        .select({ gameId: logs.gameId, finishedOn: logs.finishedOn })
        .from(logs)
        .where(and(eq(logs.userId, userId), inArray(logs.gameId, gameIds)))
    : [];
  // A play counts once per game per year: the dates of year-only entries
  // move when the list changes, so comparing days would import them again.
  const yearKey = (gameId: number, finishedOn: string | null) =>
    `${gameId}:${finishedOn?.slice(0, 4) ?? ""}`;
  const seen = new Set(
    existing.map((log) => yearKey(log.gameId, log.finishedOn)),
  );
  for (const entry of matched) {
    if (!entry.game) continue;
    const key = yearKey(entry.game.id, entry.finishedOn);
    entry.duplicate = seen.has(key);
    seen.add(key);
  }
  return matched;
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
  const chosen = entries
    .filter((entry) => entry.game && !entry.duplicate)
    .sort(
      (a, b) =>
        (a.finishedOn ?? "").localeCompare(b.finishedOn ?? "") ||
        a.index - b.index,
    );
  if (chosen.length === 0) return 0;
  return db.transaction(async (tx) => {
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
