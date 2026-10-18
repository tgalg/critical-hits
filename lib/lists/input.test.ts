import { describe, expect, it } from "vitest";
import { listLimits, parseListForm, parseNote } from "@/lib/lists/input";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

describe("parseListForm", () => {
  it("parses a full list", () => {
    expect(
      parseListForm(
        form({
          title: "  Best of 2026 ",
          description: "Line one\r\nLine two",
          isRanked: "on",
          isPublic: "on",
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        title: "Best of 2026",
        description: "Line one\nLine two",
        isRanked: true,
        isPublic: true,
      },
    });
  });

  it("treats a blank description and unticked boxes as off", () => {
    expect(parseListForm(form({ title: "Cozy", description: " " }))).toEqual({
      ok: true,
      value: {
        title: "Cozy",
        description: null,
        isRanked: false,
        isPublic: false,
      },
    });
  });

  it("requires a title and limits lengths", () => {
    expect(parseListForm(form({ title: "  " }))).toEqual({
      ok: false,
      errors: { title: "Give your list a title." },
    });
    expect(
      parseListForm(
        form({
          title: "a".repeat(listLimits.title + 1),
          description: "a".repeat(listLimits.description + 1),
        }),
      ),
    ).toEqual({
      ok: false,
      errors: {
        title: "Keep it to 100 characters or fewer.",
        description: "Keep it to 2,000 characters or fewer.",
      },
    });
  });
});

describe("parseNote", () => {
  it("trims notes, clears blank ones and rejects long ones", () => {
    expect(parseNote(form({ note: " Play it blind. " }))).toEqual({
      ok: true,
      note: "Play it blind.",
    });
    expect(parseNote(form({ note: "" }))).toEqual({ ok: true, note: null });
    expect(parseNote(form({ note: "a".repeat(listLimits.note + 1) }))).toEqual({
      ok: false,
      note: null,
    });
  });
});
