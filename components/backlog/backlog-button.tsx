import {
  addToBacklogAction,
  removeFromBacklogAction,
} from "@/app/backlog/actions";

const selectClass =
  "rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";

// The game page's backlog control: add the game (optionally naming the
// platform to play it on), or remove it when it is already queued.
export function BacklogButton({
  gameId,
  slug,
  platforms,
  entry,
}: {
  gameId: number;
  slug: string;
  platforms: { id: number; name: string }[];
  entry: { platform: string | null } | null;
}) {
  if (entry) {
    return (
      <form
        action={removeFromBacklogAction}
        className="flex flex-wrap items-center gap-3 text-sm"
      >
        <input type="hidden" name="gameId" value={gameId} />
        <input type="hidden" name="slug" value={slug} />
        <span>
          In your backlog{entry.platform ? ` on ${entry.platform}` : ""}.
        </span>
        <button type="submit" className="underline">
          Remove from backlog
        </button>
      </form>
    );
  }
  return (
    <form
      action={addToBacklogAction}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="slug" value={slug} />
      {platforms.length > 0 && (
        <>
          <label htmlFor="backlog-platform" className="sr-only">
            Backlog platform
          </label>
          <select
            id="backlog-platform"
            name="platformId"
            defaultValue=""
            className={selectClass}
          >
            <option value="">Any platform</option>
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        type="submit"
        className="rounded-md border px-4 py-2 text-sm font-medium"
      >
        Add to backlog
      </button>
    </form>
  );
}
