export const listLimits = { title: 100, description: 2_000, note: 500 };

export type ListInput = {
  title: string;
  description: string | null;
  isRanked: boolean;
  isPublic: boolean;
};

export type ListErrors = Partial<Record<"title" | "description", string>>;

export type ParsedList =
  { ok: true; value: ListInput } | { ok: false; errors: ListErrors };

type FormLike = { get(name: string): FormDataEntryValue | null };

// Browsers submit line breaks as CRLF; store them as plain newlines.
const text = (form: FormLike, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().replace(/\r\n?/g, "\n") : "";
};

const tooLong = (limit: number) =>
  `Keep it to ${limit.toLocaleString("en")} characters or fewer.`;

export function parseListForm(form: FormLike): ParsedList {
  const errors: ListErrors = {};
  const title = text(form, "title");
  if (!title) errors.title = "Give your list a title.";
  else if (title.length > listLimits.title)
    errors.title = tooLong(listLimits.title);
  const description = text(form, "description");
  if (description.length > listLimits.description) {
    errors.description = tooLong(listLimits.description);
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      description: description || null,
      isRanked: form.get("isRanked") === "on",
      isPublic: form.get("isPublic") === "on",
    },
  };
}

// A game's note on a list: blank means none, null means too long.
export function parseNote(form: FormLike): {
  ok: boolean;
  note: string | null;
} {
  const note = text(form, "note");
  if (note.length > listLimits.note) return { ok: false, note: null };
  return { ok: true, note: note || null };
}
