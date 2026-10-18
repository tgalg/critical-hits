import { inArray, sql, type AnyColumn } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { CatalogGame, CatalogSource } from "@/lib/catalog/source";
import { gamePlatforms, games, platforms } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;

const gameRow = (game: CatalogGame) => ({
  igdbId: game.igdbId,
  slug: game.slug,
  title: game.title,
  coverUrl: game.coverUrl,
  releaseDate: game.releaseDate,
  summary: game.summary,
});

const excluded = (column: AnyColumn) => sql.raw(`excluded."${column.name}"`);

// Inserts or updates games, their platforms and the links between them, keyed
// on IGDB ids, so running it twice over the same data changes nothing.
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

    const gameRows = await tx
      .insert(games)
      .values(batch.map(gameRow))
      .onConflictDoUpdate({
        target: games.igdbId,
        set: {
          slug: excluded(games.slug),
          title: excluded(games.title),
          coverUrl: excluded(games.coverUrl),
          releaseDate: excluded(games.releaseDate),
          summary: excluded(games.summary),
        },
      })
      .returning({ id: games.id, igdbId: games.igdbId });
    const gameIds = new Map(gameRows.map((row) => [row.igdbId, row.id]));

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
  });
}

export type SyncOptions = {
  updatedSince?: Date;
  // Resume after this IGDB id.
  after?: number;
  pageSize?: number;
  maxPages?: number;
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
    onPage,
  }: SyncOptions = {},
) {
  let cursor = after;
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
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
