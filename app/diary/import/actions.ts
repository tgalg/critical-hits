"use server";

import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import {
  importLineCount,
  importLineLimit,
  parseImportText,
} from "@/lib/import/parse";
import {
  importEntries,
  matchEntries,
  type MatchedEntry,
} from "@/lib/import/service";
import { requireUserId } from "@/lib/session";

export type ImportPreviewRow = Pick<
  MatchedEntry,
  "index" | "line" | "finishedOn" | "approximateDate" | "match" | "duplicate"
> & {
  game: { slug: string; title: string; releaseYear: string | null } | null;
};

export type ImportState = {
  // Bumped on every submission so the form remounts with the right defaults.
  version: number;
  text: string;
  // The text the preview was made from; importing a different text previews
  // it again instead, so the ticked rows always mean what the player saw.
  previewedText?: string;
  // The game each row matched, so a catalog change between preview and
  // import shows the new matches instead of importing different games.
  previewedMatches?: string;
  rows?: ImportPreviewRow[];
  imported?: number;
  message?: string;
};

const toRow = (entry: MatchedEntry): ImportPreviewRow => ({
  index: entry.index,
  line: entry.line,
  finishedOn: entry.finishedOn,
  approximateDate: entry.approximateDate,
  match: entry.match,
  duplicate: entry.duplicate,
  game: entry.game && {
    slug: entry.game.slug,
    title: entry.game.title,
    releaseYear: entry.game.releaseDate?.slice(0, 4) ?? null,
  },
});

// Previews the pasted list's matches, or imports the ticked rows. Both
// steps match against the catalog afresh, so nothing from the browser is
// trusted beyond the text and which rows were ticked.
export async function importAction(
  previous: ImportState,
  form: FormData,
): Promise<ImportState> {
  const userId = await requireUserId();
  const version = previous.version + 1;
  const textValue = form.get("text");
  const text = typeof textValue === "string" ? textValue : "";
  if (importLineCount(text) > importLineLimit) {
    return {
      version,
      text,
      message: `Paste at most ${importLineLimit} lines at a time.`,
    };
  }
  const today = new Date().toISOString().slice(0, 10);
  const entries = parseImportText(text, today);
  if (entries.length === 0) {
    return { version, text, message: "Paste at least one game." };
  }
  const db = getDatabase();
  const matched = await matchEntries(db, userId, entries);
  const matches = matched.map((entry) => entry.game?.id ?? "").join(",");
  const preview = (message?: string): ImportState => ({
    version,
    text,
    previewedText: text,
    previewedMatches: matches,
    rows: matched.map(toRow),
    message,
  });

  if (form.get("intent") !== "import") return preview();
  if (form.get("previewedText") !== text) {
    return preview("The list changed, so check the matches again.");
  }
  if (form.get("previewedMatches") !== matches) {
    return preview("Some matches changed, so check them again.");
  }
  const ticked = new Set(form.getAll("include").map(Number));
  const imported = await importEntries(
    db,
    userId,
    matched.filter((entry) => ticked.has(entry.index)),
  );
  revalidatePath("/diary");
  return { version, text: "", imported };
}
