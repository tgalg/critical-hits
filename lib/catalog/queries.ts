import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  isNotNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { gamePlatforms, games, platforms } from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any schema-typed Drizzle database works here
type Database = NodePgDatabase<any>;

const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

// Fuzzy title search: pg_trgm similarity catches typos, and a substring
// match catches short queries that similarity scores too low.
export async function searchGames(db: Database, query: string, limit = 24) {
  const q = query.trim();
  if (!q) return [];
  return db
    .select(coverColumns)
    .from(games)
    .where(
      or(sql`${games.title} % ${q}`, ilike(games.title, `%${escapeLike(q)}%`)),
    )
    .orderBy(
      desc(sql`similarity(${games.title}, ${q})`),
      desc(games.ratingCount),
      asc(games.title),
    )
    .limit(limit);
}

const coverColumns = {
  slug: games.slug,
  title: games.title,
  coverUrl: games.coverUrl,
  releaseDate: games.releaseDate,
};

export type BrowseGame = {
  slug: string;
  title: string;
  coverUrl: string | null;
  releaseDate: string | null;
};

export type BrowseRow = { id: string; title: string; games: BrowseGame[] };

const day = 24 * 60 * 60 * 1000;
const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

// Rows of covers for the Games page, so players have something to log before
// anyone they follow has. Until the site has ratings of its own they lean on
// IGDB's counts; rows with nothing in them are left out. Each row's order and
// date window match a page of the nightly featured refresh (see
// featuredQueries in lib/igdb/source.ts), so its top games are kept current.
export async function getBrowseRows(
  db: Database,
  { now = Date.now(), limit = 12 }: { now?: number; limit?: number } = {},
): Promise<BrowseRow[]> {
  const today = isoDate(now);
  const rows = (where: (SQL | undefined)[], ...order: SQLWrapper[]) =>
    db
      .select(coverColumns)
      .from(games)
      .where(and(isNotNull(games.coverUrl), ...where))
      .orderBy(...order.map((column) => desc(column)), asc(games.title))
      .limit(limit);

  const [popular, highlyRated, newReleases, comingSoon] = await Promise.all([
    rows(
      [or(gt(games.igdbRatingCount, 0), gt(games.ratingCount, 0))],
      games.igdbRatingCount,
      games.ratingCount,
    ),
    // Enough ratings that a handful of perfect scores can't top the row.
    rows(
      [isNotNull(games.igdbRating), gte(games.igdbRatingCount, 100)],
      games.igdbRating,
      games.igdbRatingCount,
    ),
    rows(
      [
        lte(games.releaseDate, today),
        gt(games.releaseDate, isoDate(now - 90 * day)),
        gt(games.igdbHypes, 0),
      ],
      games.igdbHypes,
      games.releaseDate,
    ),
    rows(
      [
        gt(games.releaseDate, today),
        lt(games.releaseDate, isoDate(now + 180 * day)),
        gt(games.igdbHypes, 0),
      ],
      games.igdbHypes,
    ),
  ]);

  return [
    { id: "popular", title: "Popular", games: popular },
    { id: "highly-rated", title: "Highly rated", games: highlyRated },
    { id: "new-releases", title: "New releases", games: newReleases },
    { id: "coming-soon", title: "Coming soon", games: comingSoon },
  ].filter((row) => row.games.length > 0);
}

export async function getGameBySlug(db: Database, slug: string) {
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.slug, slug))
    .limit(1);
  if (!game) return null;
  const gamePlatformRows = await db
    .select({
      id: platforms.id,
      name: platforms.name,
      abbreviation: platforms.abbreviation,
    })
    .from(gamePlatforms)
    .innerJoin(platforms, eq(platforms.id, gamePlatforms.platformId))
    .where(eq(gamePlatforms.gameId, game.id))
    .orderBy(asc(platforms.name));
  return { ...game, platforms: gamePlatformRows };
}

// Ratings are stored as 1-10 half-stars; shown as 0.5-5 stars.
export function starRating(avgRating: string | null) {
  return avgRating === null ? null : (Number(avgRating) / 2).toFixed(1);
}

export function releaseYear(releaseDate: string | null) {
  return releaseDate?.slice(0, 4) ?? null;
}

// Whether the game is released on the platform; logs and backlog entries may
// only name one of the game's own platforms.
export async function gameHasPlatform(
  db: Pick<Database, "select">,
  gameId: number,
  platformId: number,
) {
  const [link] = await db
    .select({ platformId: gamePlatforms.platformId })
    .from(gamePlatforms)
    .where(
      and(
        eq(gamePlatforms.gameId, gameId),
        eq(gamePlatforms.platformId, platformId),
      ),
    )
    .limit(1);
  return !!link;
}
