import { toggleFavouriteAction } from "@/app/account/actions";
import { maxFavourites } from "@/lib/profile/service";

// The game page's favourite-four control.
export function FavouriteButton({
  gameId,
  slug,
  favouriteIds,
}: {
  gameId: number;
  slug: string;
  favouriteIds: number[];
}) {
  const isFavourite = favouriteIds.includes(gameId);
  const full = !isFavourite && favouriteIds.length >= maxFavourites;
  return (
    <form
      action={toggleFavouriteAction}
      className="flex flex-wrap items-center gap-3 text-sm"
    >
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="slug" value={slug} />
      {isFavourite && <span>One of your favourite four.</span>}
      <button
        type="submit"
        disabled={full}
        className={
          isFavourite
            ? "underline"
            : "rounded-md border px-4 py-2 font-medium disabled:opacity-60"
        }
      >
        {isFavourite ? "Remove from favourites" : "Add to favourite four"}
      </button>
      {full && (
        <span className="text-muted-foreground">
          Your favourite four is full.
        </span>
      )}
    </form>
  );
}
