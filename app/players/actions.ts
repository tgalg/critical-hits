"use server";

import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
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
