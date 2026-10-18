"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/db";
import { parseListForm, parseNote, type ListErrors } from "@/lib/lists/input";
import {
  addToList,
  createList,
  deleteList,
  ListError,
  moveListItem,
  removeFromList,
  setListItemNote,
  updateList,
} from "@/lib/lists/service";
import { requireUserId } from "@/lib/session";

export type ListFormState = {
  status: "idle" | "saved" | "error";
  // Bumped on every submission so the form remounts with the right defaults.
  version: number;
  message?: string;
  errors?: ListErrors;
  // What the player typed, so an invalid form keeps their input.
  values?: Record<string, string>;
};

export type AddToListState = { version: number; message?: string };

const idFrom = (form: FormData, name: string) => {
  const id = Number(form.get(name));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

function refresh(listId: number | null, slug?: FormDataEntryValue | null) {
  if (listId) revalidatePath(`/lists/${listId}`);
  if (typeof slug === "string" && slug) revalidatePath(`/games/${slug}`);
  revalidatePath("/lists");
}

// Creates a list when the form has no listId, or updates the one it names.
// Ownership is checked in the service, never trusted from the form.
export async function saveList(
  previous: ListFormState,
  form: FormData,
): Promise<ListFormState> {
  const userId = await requireUserId();
  const version = previous.version + 1;
  const failed = (message: string, errors?: ListErrors): ListFormState => ({
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
  const parsed = parseListForm(form);
  if (!parsed.ok) return failed("Check the highlighted fields.", parsed.errors);
  const listId = idFrom(form, "listId");
  let id = listId;
  try {
    if (listId) await updateList(getDatabase(), userId, listId, parsed.value);
    else id = await createList(getDatabase(), userId, parsed.value);
  } catch (error) {
    if (error instanceof ListError) return failed(error.message);
    throw error;
  }
  refresh(id);
  if (!listId) redirect(`/lists/${id}`);
  return { status: "saved", version, message: "Saved." };
}

export async function deleteListAction(form: FormData) {
  const userId = await requireUserId();
  const listId = idFrom(form, "listId");
  if (listId) {
    try {
      await deleteList(getDatabase(), userId, listId);
    } catch (error) {
      if (!(error instanceof ListError)) throw error;
    }
  }
  revalidatePath("/lists");
  redirect("/lists");
}

export async function addToListAction(
  previous: AddToListState,
  form: FormData,
): Promise<AddToListState> {
  const userId = await requireUserId();
  const version = previous.version + 1;
  const listId = idFrom(form, "listId");
  const gameId = idFrom(form, "gameId");
  if (!listId || !gameId) return { version, message: "Choose a list." };
  try {
    const added = await addToList(getDatabase(), userId, listId, gameId);
    refresh(listId, form.get("slug"));
    return { version, message: added ? "Added." : "Already on that list." };
  } catch (error) {
    if (error instanceof ListError) return { version, message: error.message };
    throw error;
  }
}

// Item actions ignore a ListError: only a tampered form names a list the
// player doesn't own.
async function onItem(
  form: FormData,
  change: (userId: string, listId: number, gameId: number) => Promise<void>,
) {
  const userId = await requireUserId();
  const listId = idFrom(form, "listId");
  const gameId = idFrom(form, "gameId");
  if (!listId || !gameId) return;
  try {
    await change(userId, listId, gameId);
  } catch (error) {
    if (!(error instanceof ListError)) throw error;
  }
  refresh(listId);
}

export async function removeListItemAction(form: FormData) {
  await onItem(form, (userId, listId, gameId) =>
    removeFromList(getDatabase(), userId, listId, gameId),
  );
}

export async function moveListItemAction(form: FormData) {
  const direction = form.get("direction");
  if (direction !== "up" && direction !== "down") return;
  await onItem(form, (userId, listId, gameId) =>
    moveListItem(getDatabase(), userId, listId, gameId, direction),
  );
}

export async function saveListNoteAction(form: FormData) {
  const { ok, note } = parseNote(form);
  if (!ok) return;
  await onItem(form, (userId, listId, gameId) =>
    setListItemNote(getDatabase(), userId, listId, gameId, note),
  );
}
