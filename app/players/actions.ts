"use server";

import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import { LikeError, setLike } from "@/lib/social/likes";
import { follow, SocialError, unfollow } from "@/lib/social/service";
import { requireUserId } from "@/lib/session";

// The form names only who to follow; the follower is always the session's.
export async function toggleFollowAction(form: FormData) {
  const userId = await requireUserId();
  const followeeId = form.get("userId");
  if (typeof followeeId !== "string" || !followeeId) return;
  try {
    if (form.get("follow") === "1") {
      await follow(getDatabase(), userId, followeeId);
    } else {
      await unfollow(getDatabase(), userId, followeeId);
    }
  } catch (error) {
    // Only a tampered form names yourself or a missing player.
    if (!(error instanceof SocialError)) throw error;
  }
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
}

// Likes or unlikes a review or public list. Whose like it is comes only
// from the session.
export async function toggleLikeAction(form: FormData) {
  const userId = await requireUserId();
  const type = form.get("targetType");
  const id = Number(form.get("targetId"));
  if ((type !== "review" && type !== "list") || !Number.isSafeInteger(id)) {
    return;
  }
  try {
    await setLike(getDatabase(), userId, type, id, form.get("like") === "1");
  } catch (error) {
    // Only a stale or tampered form names a missing, hidden or own target.
    if (!(error instanceof LikeError)) throw error;
  }
  const path = form.get("path");
  // Only revalidate paths on this site.
  if (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//")
  ) {
    revalidatePath(path);
  }
}
