// A catalog source supplies game metadata; IGDB is the only one today, kept
// behind this interface so another source can replace it.
export type CatalogPlatform = {
  igdbId: number;
  name: string;
  abbreviation: string | null;
};

export type CatalogGenre = { igdbId: number; name: string };

export type CatalogGame = {
  igdbId: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  releaseDate: string | null;
  summary: string | null;
  platforms: CatalogPlatform[];
  // Left out by sources (and tests) that don't know genres.
  genres?: CatalogGenre[];
  // Left out by sources that don't know popularity; the game then has none.
  popularity?: CatalogPopularity;
};

export type CatalogPopularity = {
  // 0-100, or null when nobody has rated the game.
  rating: number | null;
  ratingCount: number;
  // Interest in an unreleased game (IGDB "hypes").
  hypes: number;
};

export type CatalogPage = {
  // Return games with igdbId greater than this, in ascending igdbId order.
  after: number;
  limit: number;
  // Only games changed at or after this time.
  updatedSince?: Date;
};

export interface CatalogSource {
  fetchGames(page: CatalogPage): Promise<CatalogGame[]>;
  // The most rated games and the most anticipated recent and upcoming ones,
  // refreshed every night so the browse rows stay current even before the
  // backfill reaches them.
  fetchFeatured?(now: Date): Promise<CatalogGame[]>;
}
