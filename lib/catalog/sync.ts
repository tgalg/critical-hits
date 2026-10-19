import { eq, inArray, sql, type AnyColumn } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { CatalogGame, CatalogSource } from "@/lib/catalog/source";
import {
  gameGenres,
  gamePlatforms,
  games,
  genres,
  platforms,
  syncCursors,
} from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;

const gameRow = (game: CatalogGame) => ({
  igdbId: game.igdbId,
  slug: game.slug,
  title: game.title,
  coverUrl: game.coverUrl,
  releaseDate: game.releaseDate,
  summary: game.summary,
  ...(game.popularity && {
    igdbRating: game.popularity.rating?.toFixed(2) ?? null,
    igdbRatingCount: game.popularity.ratingCount,
    igdbHypes: game.popularity.hypes,
  }),
});

const excluded = (column: AnyColumn) => sql.raw(`excluded."${column.name}"`);

// Inserts or updates games, their platforms and genres and the links between
// them, keyed on IGDB ids, so running it twice over the same data changes
// nothing.
export async function upsertCatalogGames(db: Database, batch: CatalogGame[]) {
  if (batch.length === 0) return;
  await db.transaction(async (tx) => {
    const uniquePlatforms = [
      ...new Map(
        batch.flatMap((game) => game.platforms).map((p) => [p.igdbId, p]),
      ).values(),
    ];
    const platformIds = new Map<number, number>();
    if (uniquePlatforms.length > 0) {
      const rows = await tx
        .insert(platforms)
        .values(uniquePlatforms)
        .onConflictDoUpdate({
          target: platforms.igdbId,
          set: {
            name: excluded(platforms.name),
            abbreviation: excluded(platforms.abbreviation),
          },
        })
        .returning({ id: platforms.id, igdbId: platforms.igdbId });
      for (const row of rows) platformIds.set(row.igdbId, row.id);
    }

    // A source that doesn't know popularity leaves it out; only games that
    // came with it have theirs replaced, so they go in a separate statement.
    const gameIds = new Map<number, number>();
    for (const withPopularity of [true, false]) {
      const group = batch.filter(
        (game) => !!game.popularity === withPopularity,
      );
      if (group.length === 0) continue;
      const rows = await tx
        .insert(games)
        .values(group.map(gameRow))
        .onConflictDoUpdate({
          target: games.igdbId,
          set: {
            slug: excluded(games.slug),
            title: excluded(games.title),
            coverUrl: excluded(games.coverUrl),
            releaseDate: excluded(games.releaseDate),
            summary: excluded(games.summary),
            ...(withPopularity && {
              igdbRating: excluded(games.igdbRating),
              igdbRatingCount: excluded(games.igdbRatingCount),
              igdbHypes: excluded(games.igdbHypes),
            }),
          },
        })
        .returning({ id: games.id, igdbId: games.igdbId });
      for (const row of rows) gameIds.set(row.igdbId, row.id);
    }

    await tx
      .delete(gamePlatforms)
      .where(inArray(gamePlatforms.gameId, [...gameIds.values()]));
    const links = batch.flatMap((game) =>
      game.platforms.map((platform) => ({
        gameId: gameIds.get(game.igdbId)!,
        platformId: platformIds.get(platform.igdbId)!,
      })),
    );
    if (links.length > 0) {
      await tx.insert(gamePlatforms).values(links).onConflictDoNothing();
    }

    const uniqueGenres = [
      ...new Map(
        batch.flatMap((game) => game.genres ?? []).map((g) => [g.igdbId, g]),
      ).values(),
    ];
    const genreIds = new Map<number, number>();
    if (uniqueGenres.length > 0) {
      const rows = await tx
        .insert(genres)
        .values(uniqueGenres)
        .onConflictDoUpdate({
          target: genres.igdbId,
          set: { name: excluded(genres.name) },
        })
        .returning({ id: genres.id, igdbId: genres.igdbId });
      for (const row of rows) genreIds.set(row.igdbId, row.id);
    }
    // A source that doesn't know genres leaves them out; only games that came
    // with a list (even an empty one) have their links replaced.
    const withGenres = batch.filter((game) => game.genres !== undefined);
    if (withGenres.length > 0) {
      await tx.delete(gameGenres).where(
        inArray(
          gameGenres.gameId,
          withGenres.map((game) => gameIds.get(game.igdbId)!),
        ),
      );
    }
    const genreLinks = withGenres.flatMap((game) =>
      (game.genres ?? []).map((genre) => ({
        gameId: gameIds.get(game.igdbId)!,
        genreId: genreIds.get(genre.igdbId)!,
      })),
    );
    if (genreLinks.length > 0) {
      await tx.insert(gameGenres).values(genreLinks).onConflictDoNothing();
    }
  });
}

export type SyncOptions = {
  updatedSince?: Date;
  // Resume after this IGDB id.
  after?: number;
  pageSize?: number;
  maxPages?: number;
  // Stop starting new pages after this time (ms since the epoch).
  deadline?: number;
  onPage?: (progress: { games: number; cursor: number }) => void;
};

export async function syncCatalog(
  db: Database,
  source: CatalogSource,
  {
    updatedSince,
    after = 0,
    pageSize = 500,
    maxPages = Infinity,
    deadline = Infinity,
    onPage,
  }: SyncOptions = {},
) {
  let cursor = after;
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
    if (page > 0 && Date.now() >= deadline) break;
    const batch = await source.fetchGames({
      after: cursor,
      limit: pageSize,
      updatedSince,
    });
    await upsertCatalogGames(db, batch);
    total += batch.length;
    if (batch.length > 0) cursor = batch[batch.length - 1].igdbId;
    onPage?.({ games: total, cursor });
    if (batch.length < pageSize) return { games: total, cursor, done: true };
  }
  return { games: total, cursor, done: false };
}

// Versioned: a new name restarts the backfill from scratch, and a run still
// going on an older deploy can only advance its own, retired cursor. The
// "-genres" pass revisits every game to fill in genres.
const backfillCursor = "igdb-backfill-genres";

// Overlapping runs (a manual run during the nightly one) may finish out of
// order, so saved progress only ever moves forward.
export async function saveBackfillProgress(
  db: Database,
  progress: { name: string; cursor: number; done: boolean },
) {
  await db
    .insert(syncCursors)
    .values(progress)
    .onConflictDoUpdate({
      target: syncCursors.name,
      set: {
        cursor: sql`greatest(${syncCursors.cursor}, ${excluded(syncCursors.cursor)})`,
        done: sql`${syncCursors.done} or ${excluded(syncCursors.done)}`,
      },
    });
}
const day = 24 * 60 * 60 * 1000;

// The nightly job: first games IGDB changed in the last two days, so one
// missed run is covered by the next; then the featured games, whose ratings
// and hype move daily without always counting as a change; then, with the
// time left, the full backfill continues from where the last run stopped until
// it reaches the end.
export async function runNightlySync(
  db: Database,
  source: CatalogSource,
  {
    deadline,
    now = Date.now(),
    pageSize,
    backfillPages,
  }: {
    deadline: number;
    now?: number;
    pageSize?: number;
    backfillPages?: number;
  },
) {
  const updated = await syncCatalog(db, source, {
    updatedSince: new Date(now - 2 * day),
    deadline,
    pageSize,
  });

  let featured = 0;
  if (source.fetchFeatured && Date.now() < deadline) {
    const batch = await source.fetchFeatured(new Date(now));
    await upsertCatalogGames(db, batch);
    featured = batch.length;
  }

  const [saved] = await db
    .select()
    .from(syncCursors)
    .where(eq(syncCursors.name, backfillCursor));
  if (saved?.done || Date.now() >= deadline) {
    return { updated, featured, backfill: saved ?? null };
  }
  const result = await syncCatalog(db, source, {
    after: saved?.cursor ?? 0,
    deadline,
    pageSize,
    maxPages: backfillPages,
  });
  const backfill = {
    name: backfillCursor,
    cursor: result.cursor,
    done: result.done,
  };
  await saveBackfillProgress(db, backfill);
  return { updated, featured, backfill };
}
