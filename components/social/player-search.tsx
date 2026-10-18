export function PlayerSearch({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/players" className="flex gap-2" role="search">
      <label htmlFor="player-search" className="sr-only">
        Find players
      </label>
      <input
        id="player-search"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Find players by username"
        className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      <button type="submit" className="rounded-md border px-4 py-2 text-sm">
        Search
      </button>
    </form>
  );
}
