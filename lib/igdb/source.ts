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
  };
}

export function gamesQuery({ after, limit, updatedSince }: CatalogPage) {
  const filters = [
    `id > ${after}`,
    `game_type = ${gameTypes}`,
    "cover != null",
    ...(updatedSince
      ? [`updated_at >= ${Math.floor(updatedSince.getTime() / 1000)}`]
      : []),
  ];
  return `fields ${fields}; where ${filters.join(" & ")}; sort id asc; limit ${limit};`;
}

export function createIgdbSource(client: IgdbClient): CatalogSource {
  return {
    async fetchGames(page) {
      const games = await client.query<IgdbGame>("games", gamesQuery(page));
      return games.map(mapIgdbGame);
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
