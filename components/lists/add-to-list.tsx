"use client";

import Link from "next/link";
import { useActionState } from "react";
import { addToListAction, type AddToListState } from "@/app/lists/actions";

const selectClass =
  "rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";

// The game page's list control: pick one of the player's lists and add the
// game to the end of it.
export function AddToList({
  gameId,
  slug,
  lists,
}: {
  gameId: number;
  slug: string;
  lists: { id: number; title: string }[];
}) {
  const [state, action, pending] = useActionState<AddToListState, FormData>(
    addToListAction,
    { version: 0 },
  );
  if (lists.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href="/lists" className="underline">
          Make a list
        </Link>{" "}
        to collect games like this one.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="slug" value={slug} />
      <label htmlFor="add-to-list" className="sr-only">
        List
      </label>
      <select id="add-to-list" name="listId" className={selectClass}>
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.title}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        Add to list
      </button>
      {state.message && (
        <span role="status" className="text-sm text-muted-foreground">
          {state.message}
        </span>
      )}
    </form>
  );
}
