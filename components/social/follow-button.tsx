import { toggleFollowAction } from "@/app/players/actions";

export function FollowButton({
  userId,
  following,
}: {
  userId: string;
  following: boolean;
}) {
  return (
    <form action={toggleFollowAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="follow" value={following ? "0" : "1"} />
      <button
        type="submit"
        className={
          following
            ? "rounded-md border px-4 py-2 text-sm font-medium"
            : "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        }
      >
        {following ? "Unfollow" : "Follow"}
      </button>
    </form>
  );
}
