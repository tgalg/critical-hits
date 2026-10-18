"use server";

import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import {
  addToBacklog,
  BacklogError,
  moveBacklogItem,
  removeFromBacklog,
} from "@/lib/backlog/service";
import { requireUserId } from "@/lib/session";

const idFrom = (form: FormData, name: string) => {
  const id = Number(form.get(name));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

function refresh(form: FormData) {
  const slug = form.get("slug");
  if (typeof slug === "string" && slug) revalidatePath(`/games/${slug}`);
  revalidatePath("/backlog");
}

// Each action reads the player from the session; the form only names the game.
export async function addToBacklogAction(form: FormData) {
  const userId = await requireUserId();
  const gameId = idFrom(form, "gameId");
  if (!gameId) return;
  try {
    await addToBacklog(
      getDatabase(),
      userId,
      gameId,
      idFrom(form, "platformId"),
    );
  } catch (error) {
    // Only a tampered form names a missing game or a foreign platform.
    if (!(error instanceof BacklogError)) throw error;
  }
  refresh(form);
}

export async function removeFromBacklogAction(form: FormData) {
  const userId = await requireUserId();
  const gameId = idFrom(form, "gameId");
  if (gameId) await removeFromBacklog(getDatabase(), userId, gameId);
  refresh(form);
}

export async function moveBacklogAction(form: FormData) {
  const userId = await requireUserId();
  const gameId = idFrom(form, "gameId");
  const direction = form.get("direction");
  if (gameId && (direction === "up" || direction === "down")) {
    await moveBacklogItem(getDatabase(), userId, gameId, direction);
  }
  refresh(form);
}
