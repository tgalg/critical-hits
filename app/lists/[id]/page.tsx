import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import {
  deleteListAction,
  moveListItemAction,
  removeListItemAction,
  saveListNoteAction,
} from "@/app/lists/actions";
import { GameCover } from "@/components/catalog/game-cover";
import { ListForm } from "@/components/lists/list-form";
import { getDatabase } from "@/lib/db";
import { listLimits } from "@/lib/lists/input";
import { getList } from "@/lib/lists/service";
import { getCurrentUser } from "@/lib/session";
import { LikeButton } from "@/components/social/like-button";
import { getLikedIds, getListLikeCount } from "@/lib/social/likes";

const smallButton =
  "rounded border px-2 py-1 text-xs disabled:opacity-40 hover:bg-muted";

// Metadata and the page share one load per request.
const loadList = cache(async (id: string) => {
  const listId = Number(id);
  const user = await getCurrentUser();
  const list = Number.isSafeInteger(listId)
    ? await getList(getDatabase(), listId, user?.id ?? null)
    : null;
  return { list, user };
});

export async function generateMetadata(
  props: PageProps<"/lists/[id]">,
): Promise<Metadata> {
  const { list } = await loadList((await props.params).id);
  return { title: list ? `${list.title} · Critical Hits` : "List not found" };
}

export default async function ListPage(props: PageProps<"/lists/[id]">) {
  const { list, user } = await loadList((await props.params).id);
  if (!list) notFound();
  const owner = user?.id === list.userId;
  const [likeCount, liked] = await Promise.all([
    getListLikeCount(getDatabase(), list.id),
    getLikedIds(getDatabase(), user?.id ?? null, "list", [list.id]),
  ]);
  const items = list.items;
  const hidden = (name: string, value: string | number) => (
    <input type="hidden" name={name} value={value} />
  );

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      {owner && (
        <Link
          href="/lists"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Your lists
        </Link>
      )}
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{list.title}</h1>
        <p className="text-sm text-muted-foreground">
          A list by{" "}
          <Link href={`/u/${list.owner}`} className="underline">
            {list.owner}
          </Link>
          {!list.isPublic && " · Private"}
        </p>
        {list.isPublic && (
          <LikeButton
            type="list"
            id={list.id}
            count={likeCount}
            liked={liked.has(list.id)}
            canLike={!!user && !owner}
            path={`/lists/${list.id}`}
            label={list.title}
          />
        )}
        {list.description && (
          <p className="leading-relaxed whitespace-pre-line">
            {list.description}
          </p>
        )}
      </header>

      {items.length === 0 ? (
        <p className="text-muted-foreground">
          {owner ? (
            <>
              No games yet.{" "}
              <Link href="/games" className="underline">
                Find a game
              </Link>{" "}
              and add it from its page.
            </>
          ) : (
            "No games on this list yet."
          )}
        </p>
      ) : (
        <ol aria-label="Games" className="divide-y rounded-lg border">
          {items.map((item, index) => (
            <li key={item.gameId} className="space-y-3 p-3">
              <div className="flex items-center gap-4">
                {list.isRanked && (
                  <span className="w-6 text-center text-sm text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                )}
                <GameCover
                  src={item.game.coverUrl}
                  title={item.game.title}
                  className="w-10 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/games/${item.game.slug}`}
                    className="font-medium hover:underline"
                  >
                    {item.game.title}
                  </Link>
                  {!owner && item.note && (
                    <p className="text-sm whitespace-pre-line text-muted-foreground">
                      {item.note}
                    </p>
                  )}
                </div>
                {owner && (
                  <div className="flex gap-1">
                    {(["up", "down"] as const).map((direction) => (
                      <form key={direction} action={moveListItemAction}>
                        {hidden("listId", list.id)}
                        {hidden("gameId", item.gameId)}
                        {hidden("direction", direction)}
                        <button
                          type="submit"
                          className={smallButton}
                          disabled={
                            direction === "up"
                              ? index === 0
                              : index === items.length - 1
                          }
                          aria-label={`Move ${item.game.title} ${direction}`}
                        >
                          {direction === "up" ? "↑" : "↓"}
                        </button>
                      </form>
                    ))}
                    <form action={removeListItemAction}>
                      {hidden("listId", list.id)}
                      {hidden("gameId", item.gameId)}
                      <button
                        type="submit"
                        className={smallButton}
                        aria-label={`Remove ${item.game.title}`}
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                )}
              </div>
              {owner && (
                <form
                  // Remount when the saved note changes so the field shows it.
                  key={item.note ?? ""}
                  action={saveListNoteAction}
                  className="flex gap-2"
                >
                  {hidden("listId", list.id)}
                  {hidden("gameId", item.gameId)}
                  <label htmlFor={`note-${item.gameId}`} className="sr-only">
                    Note on {item.game.title}
                  </label>
                  <input
                    id={`note-${item.gameId}`}
                    name="note"
                    defaultValue={item.note ?? ""}
                    maxLength={listLimits.note}
                    placeholder="Add a note"
                    className="min-w-0 flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                  />
                  <button
                    type="submit"
                    className={smallButton}
                    aria-label={`Save note on ${item.game.title}`}
                  >
                    Save
                  </button>
                </form>
              )}
            </li>
          ))}
        </ol>
      )}

      {owner && (
        <section
          aria-labelledby="edit-list"
          className="space-y-6 border-t pt-8"
        >
          <h2 id="edit-list" className="font-medium">
            Edit list
          </h2>
          <ListForm
            listId={list.id}
            defaults={{
              title: list.title,
              description: list.description ?? "",
              isRanked: list.isRanked,
              isPublic: list.isPublic,
            }}
            submitLabel="Save list"
          />
          <form action={deleteListAction}>
            {hidden("listId", list.id)}
            <button
              type="submit"
              className="text-sm text-destructive underline"
            >
              Delete this list
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
