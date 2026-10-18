import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { upsertCatalogGames } from "@/lib/catalog/sync";
import { activities, games, likes, listItems, users } from "@/lib/db/schema";
import type { ListInput } from "@/lib/lists/input";
import {
  addToList,
  createList,
  deleteList,
  getList,
  getUserLists,
  ListError,
  moveListItem,
  removeFromList,
  setListItemNote,
  updateList,
} from "@/lib/lists/service";
import {
  hasTestDatabase,
  openTestDatabase,
  resetTestDatabase,
} from "@/lib/test-database";

const list = (overrides: Partial<ListInput> = {}): ListInput => ({
  title: "Favourites",
  description: null,
  isRanked: false,
  isPublic: true,
  ...overrides,
});

describe.skipIf(!hasTestDatabase)("lists", () => {
  const { pool, db } = openTestDatabase();
  const game = new Map<string, number>();

  beforeAll(async () => {
    await resetTestDatabase(pool, db);
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE users, games, platforms, activities, likes RESTART IDENTITY CASCADE",
    );
    await db.insert(users).values([
      { id: "ana", email: "ana@example.com", username: "ana" },
      { id: "ben", email: "ben@example.com", username: "ben" },
    ]);
    const entry = (igdbId: number, slug: string) => ({
      igdbId,
      slug,
      title: slug,
      coverUrl: null,
      releaseDate: null,
      summary: null,
      platforms: [],
    });
    await upsertCatalogGames(db, [
      entry(1, "hades"),
      entry(2, "celeste"),
      entry(3, "tunic"),
    ]);
    for (const row of await db.select().from(games)) game.set(row.slug, row.id);
  });

  afterAll(async () => {
    await pool.end();
  });

  const titles = async (listId: number, viewer: string | null = "ana") =>
    (await getList(db, listId, viewer))?.items.map((item) => item.game.title);

  const positions = async (listId: number) =>
    (
      await db
        .select({ position: listItems.position })
        .from(listItems)
        .where(eq(listItems.listId, listId))
    )
      .map((row) => row.position)
      .sort();

  it("creates a list with a created_list activity", async () => {
    const id = await createList(db, "ana", list({ isRanked: true }));
    expect(
      await db
        .select({ verb: activities.verb, objectId: activities.objectId })
        .from(activities),
    ).toEqual([{ verb: "created_list", objectId: id }]);
    expect(await getUserLists(db, "ana")).toEqual([
      {
        id,
        title: "Favourites",
        isPublic: true,
        isRanked: true,
        gameCount: 0,
      },
    ]);
    expect(await getUserLists(db, "ben")).toEqual([]);
  });

  it("adds games in order and ignores duplicates", async () => {
    const id = await createList(db, "ana", list());
    expect(await addToList(db, "ana", id, game.get("hades")!)).toBe(true);
    expect(await addToList(db, "ana", id, game.get("celeste")!)).toBe(true);
    expect(await addToList(db, "ana", id, game.get("hades")!)).toBe(false);
    expect(await titles(id)).toEqual(["hades", "celeste"]);
    expect((await getUserLists(db, "ana"))[0].gameCount).toBe(2);
    await expect(addToList(db, "ana", id, 999_999)).rejects.toThrow(ListError);
  });

  it("moves, removes and notes games with unique positions", async () => {
    const id = await createList(db, "ana", list());
    for (const slug of ["hades", "celeste", "tunic"]) {
      await addToList(db, "ana", id, game.get(slug)!);
    }
    await moveListItem(db, "ana", id, game.get("tunic")!, "up");
    await moveListItem(db, "ana", id, game.get("hades")!, "up");
    expect(await titles(id)).toEqual(["hades", "tunic", "celeste"]);
    await removeFromList(db, "ana", id, game.get("tunic")!);
    await addToList(db, "ana", id, game.get("tunic")!);
    await moveListItem(db, "ana", id, game.get("tunic")!, "down");
    expect(await titles(id)).toEqual(["hades", "celeste", "tunic"]);
    expect(new Set(await positions(id)).size).toBe(3);

    await setListItemNote(db, "ana", id, game.get("hades")!, "Play it first.");
    const notes = (await getList(db, id, null))?.items.map((item) => item.note);
    expect(notes).toEqual(["Play it first.", null, null]);
  });

  it("keeps positions unique when adding at once", async () => {
    const id = await createList(db, "ana", list());
    await Promise.all(
      ["hades", "celeste", "tunic"].map((slug) =>
        addToList(db, "ana", id, game.get(slug)!),
      ),
    );
    expect(await positions(id)).toEqual([1, 2, 3]);
  });

  it("only lets the owner change a list", async () => {
    const id = await createList(db, "ana", list());
    await addToList(db, "ana", id, game.get("hades")!);
    const hades = game.get("hades")!;
    for (const attempt of [
      () => updateList(db, "ben", id, list({ title: "Mine now" })),
      () => addToList(db, "ben", id, game.get("celeste")!),
      () => removeFromList(db, "ben", id, hades),
      () => moveListItem(db, "ben", id, hades, "down"),
      () => setListItemNote(db, "ben", id, hades, "Ha"),
      () => deleteList(db, "ben", id),
    ]) {
      await expect(attempt()).rejects.toThrow(ListError);
    }
    const unchanged = await getList(db, id, "ana");
    expect(unchanged?.title).toBe("Favourites");
    expect(unchanged?.items.map((item) => item.note)).toEqual([null]);
  });

  it("shows private lists only to their owner", async () => {
    const id = await createList(db, "ana", list({ isPublic: false }));
    expect((await getList(db, id, "ana"))?.owner).toBe("ana");
    expect(await getList(db, id, "ben")).toBeNull();
    expect(await getList(db, id, null)).toBeNull();
    await updateList(db, "ana", id, list({ isPublic: true }));
    expect((await getList(db, id, null))?.title).toBe("Favourites");
  });

  it("deletes a list with its items, likes and activity", async () => {
    const id = await createList(db, "ana", list());
    const kept = await createList(db, "ana", list({ title: "Keep" }));
    await addToList(db, "ana", id, game.get("hades")!);
    await db.insert(likes).values([
      { userId: "ben", targetType: "list", targetId: id },
      { userId: "ben", targetType: "list", targetId: kept },
    ]);
    await deleteList(db, "ana", id);
    expect(await getList(db, id, "ana")).toBeNull();
    expect(await db.$count(listItems)).toBe(0);
    expect(
      (await db.select().from(likes)).map((like) => like.targetId),
    ).toEqual([kept]);
    expect(
      (await db.select().from(activities)).map((row) => row.objectId),
    ).toEqual([kept]);
  });
});
