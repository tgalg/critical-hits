import type { Metadata } from "next";
import Link from "next/link";
import { GameCover } from "@/components/catalog/game-cover";
import { releaseYear, searchGames } from "@/lib/catalog/queries";
import { getDatabase } from "@/lib/db";

export const metadata: Metadata = { title: "Games · Critical Hits" };

export default async function GamesPage(props: PageProps<"/games">) {
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q : "";
  const results = query ? await searchGames(getDatabase(), query) : [];

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Games</h1>
      <form action="/games" role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search games
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search for a game"
          className="w-full rounded-md border bg-background px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground"
        >
          Search
        </button>
      </form>

      {query && results.length === 0 && (
        <p className="text-muted-foreground">
          No games match &ldquo;{query}&rdquo;.
        </p>
      )}
      {results.length > 0 && (
        <ul className="grid grid-cols-2 gap-6 sm:grid-cols-4 lg:grid-cols-6">
          {results.map((game) => (
            <li key={game.slug}>
              <Link href={`/games/${game.slug}`} className="group space-y-2">
                <GameCover src={game.coverUrl} title={game.title} />
                <p className="text-sm font-medium group-hover:underline">
                  {game.title}
                </p>
                {game.releaseDate && (
                  <p className="text-xs text-muted-foreground">
                    {releaseYear(game.releaseDate)}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
