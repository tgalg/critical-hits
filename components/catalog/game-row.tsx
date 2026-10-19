import Link from "next/link";
import { GameCover } from "@/components/catalog/game-cover";
import type { BrowseRow } from "@/lib/catalog/queries";

// A titled row of covers that scrolls sideways on narrow screens.
export function GameRow({ row }: { row: BrowseRow }) {
  return (
    <section aria-labelledby={row.id} className="space-y-3">
      <h2 id={row.id} className="text-xl font-semibold">
        {row.title}
      </h2>
      <ul className="-mx-6 flex snap-x scroll-px-6 gap-4 overflow-x-auto px-6 pb-2">
        {row.games.map((game) => (
          <li key={game.slug} className="w-28 shrink-0 snap-start sm:w-36">
            <Link
              href={`/games/${game.slug}`}
              title={game.title}
              className="group block space-y-2"
            >
              <GameCover
                src={game.coverUrl}
                title={game.title}
                className="transition group-hover:ring-2 group-hover:ring-primary"
              />
              <p className="truncate text-sm font-medium group-hover:underline">
                {game.title}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
