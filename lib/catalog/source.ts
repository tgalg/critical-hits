// A catalog source supplies game metadata; IGDB is the only one today, kept
// behind this interface so another source can replace it.
export type CatalogPlatform = {
  igdbId: number;
  name: string;
  abbreviation: string | null;
};

export type CatalogGame = {
  igdbId: number;
  slug: string;
  title: string;
  coverUrl: string | null;
  releaseDate: string | null;
  summary: string | null;
  platforms: CatalogPlatform[];
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
}
