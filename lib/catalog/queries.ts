import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
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
    .select({
      slug: games.slug,
      title: games.title,
      coverUrl: games.coverUrl,
      releaseDate: games.releaseDate,
    })
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

export async function getGameBySlug(db: Database, slug: string) {
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.slug, slug))
    .limit(1);
  if (!game) return null;
  const gamePlatformRows = await db
    .select({ name: platforms.name, abbreviation: platforms.abbreviation })
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
