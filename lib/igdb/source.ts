import type {
  CatalogGame,
  CatalogPage,
  CatalogSource,
} from "@/lib/catalog/source";
import { createIgdbClient, type IgdbClient } from "@/lib/igdb/client";

export type IgdbGame = {
  id: number;
  name: string;
  slug: string;
  summary?: string;
  first_release_date?: number;
  cover?: { id: number; image_id: string };
  platforms?: { id: number; name: string; abbreviation?: string }[];
  genres?: { id: number; name: string }[];
  total_rating?: number;
  total_rating_count?: number;
  hypes?: number;
};

// Main games, remakes and remasters (IGDB game_type ids 0, 8 and 9).
const gameTypes = "(0,8,9)";

const fields = [
  "name",
  "slug",
  "summary",
  "first_release_date",
  "cover.image_id",
  "platforms.name",
  "platforms.abbreviation",
  "genres.name",
  "total_rating",
  "total_rating_count",
  "hypes",
].join(",");

export function coverUrl(imageId: string) {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
}

export function mapIgdbGame(game: IgdbGame): CatalogGame {
  return {
    igdbId: game.id,
    slug: game.slug,
    title: game.name,
    coverUrl: game.cover ? coverUrl(game.cover.image_id) : null,
    releaseDate:
      game.first_release_date === undefined
        ? null
        : new Date(game.first_release_date * 1000).toISOString().slice(0, 10),
    summary: game.summary ?? null,
    platforms: (game.platforms ?? []).map((platform) => ({
      igdbId: platform.id,
      name: platform.name,
      abbreviation: platform.abbreviation ?? null,
    })),
    genres: (game.genres ?? []).map((genre) => ({
      igdbId: genre.id,
      name: genre.name,
    })),
    popularity: {
      rating:
        game.total_rating === undefined
          ? null
          : Math.round(game.total_rating * 100) / 100,
      ratingCount: game.total_rating_count ?? 0,
      hypes: game.hypes ?? 0,
    },
  };
}

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

function query(filters: string[], sort: string, limit: number) {
  const where = [`game_type = ${gameTypes}`, "cover != null", ...filters];
  return `fields ${fields}; where ${where.join(" & ")}; sort ${sort}; limit ${limit};`;
}

export function gamesQuery({ after, limit, updatedSince }: CatalogPage) {
  return query(
    [
      `id > ${after}`,
      ...(updatedSince ? [`updated_at >= ${seconds(updatedSince)}`] : []),
    ],
    "id asc",
    limit,
  );
}

const day = 24 * 60 * 60 * 1000;

// IGDB's page limit is 500: the most rated games of all time, the best rated
// of those with enough ratings (the same bar as the "Highly rated" row), and
// the most hyped games released in the last four months or due in the next six.
export function featuredQueries(now: Date) {
  return [
    query(["total_rating_count > 0"], "total_rating_count desc", 500),
    query(["total_rating_count >= 100"], "total_rating desc", 500),
    query(
      [
        `first_release_date >= ${seconds(new Date(now.getTime() - 120 * day))}`,
        `first_release_date < ${seconds(new Date(now.getTime() + 180 * day))}`,
      ],
      "hypes desc",
      500,
    ),
  ];
}

export function createIgdbSource(client: IgdbClient): CatalogSource {
  return {
    async fetchGames(page) {
      const games = await client.query<IgdbGame>("games", gamesQuery(page));
      return games.map(mapIgdbGame);
    },
    async fetchFeatured(now) {
      const pages = [];
      for (const body of featuredQueries(now)) {
        pages.push(await client.query<IgdbGame>("games", body));
      }
      // A game can be on both lists; keep one copy.
      const unique = new Map(pages.flat().map((game) => [game.id, game]));
      return [...unique.values()].map(mapIgdbGame);
    },
  };
}

export function igdbSourceFromEnv() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required to sync from IGDB.",
    );
  }
  return createIgdbSource(createIgdbClient({ clientId, clientSecret }));
}
