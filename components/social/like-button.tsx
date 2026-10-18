import { toggleLikeAction } from "@/app/players/actions";

// A heart with the like count. Signed-out visitors and owners see the count
// only; everyone else can toggle their like.
export function LikeButton({
  type,
  id,
  count,
  liked,
  canLike,
  path,
  label,
}: {
  type: "review" | "list";
  id: number;
  count: number;
  liked: boolean;
  canLike: boolean;
  path: string;
  label: string;
}) {
  const text = `${count} ${count === 1 ? "like" : "likes"}`;
  if (!canLike) {
    return <span className="text-xs text-muted-foreground">♥ {text}</span>;
  }
  return (
    <form action={toggleLikeAction} className="inline">
      <input type="hidden" name="targetType" value={type} />
      <input type="hidden" name="targetId" value={id} />
      <input type="hidden" name="like" value={liked ? "0" : "1"} />
      <input type="hidden" name="path" value={path} />
      <button
        type="submit"
        aria-pressed={liked}
        aria-label={`${liked ? "Unlike" : "Like"} ${label}`}
        className={`text-xs ${liked ? "text-red-500" : "text-muted-foreground hover:text-foreground"}`}
      >
        ♥ {text}
      </button>
    </form>
  );
}
