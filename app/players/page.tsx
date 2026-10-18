import type { Metadata } from "next";
import Link from "next/link";
import { PlayerSearch } from "@/components/social/player-search";
import { getDatabase } from "@/lib/db";
import { searchPlayers } from "@/lib/social/service";

export const metadata: Metadata = { title: "Find players · Critical Hits" };

export default async function PlayersPage(props: PageProps<"/players">) {
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 50) : "";
  const players = query ? await searchPlayers(getDatabase(), query) : [];

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Find players</h1>
      <PlayerSearch defaultValue={query} />
      {query && players.length === 0 && (
        <p className="text-muted-foreground">No players match “{query}”.</p>
      )}
      {players.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {players.map((player) => (
            <li key={player.username} className="p-4">
              <Link
                href={`/u/${player.username}`}
                className="font-medium hover:underline"
              >
                {player.displayName || player.username}
              </Link>{" "}
              <span className="text-sm text-muted-foreground">
                @{player.username}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
