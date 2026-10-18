"use server";

import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import { parseProfileForm, type ProfileErrors } from "@/lib/profile/input";
import {
  ProfileError,
  toggleFavourite,
  updateProfile,
} from "@/lib/profile/service";
import { requireUserId } from "@/lib/session";

export type ProfileFormState = {
  status: "idle" | "saved" | "error";
  // Bumped on every submission so the form remounts with the right defaults.
  version: number;
  message?: string;
  errors?: ProfileErrors;
  // What the player typed, so an invalid form keeps their input.
  values?: Record<string, string>;
};

export async function saveProfile(
  previous: ProfileFormState,
  form: FormData,
): Promise<ProfileFormState> {
  const userId = await requireUserId();
  const version = previous.version + 1;
  const failed = (
    message: string,
    errors?: ProfileErrors,
  ): ProfileFormState => ({
    status: "error",
    version,
    message,
    errors,
    values: Object.fromEntries(
      [...form.entries()].filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  });
  const parsed = parseProfileForm(form);
  if (!parsed.ok) return failed("Check the highlighted fields.", parsed.errors);
  try {
    await updateProfile(getDatabase(), userId, parsed.value);
  } catch (error) {
    if (error instanceof ProfileError) {
      return failed(error.message, { username: error.message });
    }
    throw error;
  }
  // The header, account page and every page naming the player may change.
  revalidatePath("/", "layout");
  return { status: "saved", version, message: "Saved." };
}

export async function toggleFavouriteAction(form: FormData) {
  const userId = await requireUserId();
  const gameId = Number(form.get("gameId"));
  if (!Number.isSafeInteger(gameId) || gameId <= 0) return;
  try {
    await toggleFavourite(getDatabase(), userId, gameId);
  } catch (error) {
    // A full favourite four is shown on the button, so only a tampered or
    // stale form gets here; leave the favourites unchanged.
    if (!(error instanceof ProfileError)) throw error;
  }
  const slug = form.get("slug");
  if (typeof slug === "string" && slug) revalidatePath(`/games/${slug}`);
  revalidatePath("/u/[username]", "page");
}
