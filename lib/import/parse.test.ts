import { describe, expect, it } from "vitest";
import { normaliseTitle, parseImportText } from "@/lib/import/parse";

describe("parseImportText", () => {
  it("reads year headings and spreads their games over the year in order", () => {
    const entries = parseImportText(
      "## 2020\nHalf Life 2\nDOOM Eternal\nBioshock\n",
      "2026-10-19",
    );
    expect(entries.map((e) => e.title)).toEqual([
      "Half Life 2",
      "DOOM Eternal",
      "Bioshock",
    ]);
    const dates = entries.map((e) => e.finishedOn!);
    expect(dates.every((d) => d.startsWith("2020-"))).toBe(true);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(3);
    expect(entries.every((e) => e.approximateDate)).toBe(true);
  });

  it("ends the current year's dates at today", () => {
    const entries = parseImportText("2026\nA\nB\nC", "2026-03-01");
    expect(entries.every((e) => e.finishedOn! <= "2026-03-01")).toBe(true);
  });

  it("keeps exact dates and release-year hints", () => {
    const [entry] = parseImportText(
      "2021\n2021-06-05 Resident Evil 2 (2019)",
      "2026-10-19",
    );
    expect(entry).toMatchObject({
      title: "Resident Evil 2",
      releaseYear: 2019,
      finishedOn: "2021-06-05",
      approximateDate: false,
    });
  });

  it("cleans list markers, links, asterisks and checkboxes", () => {
    const entries = parseImportText(
      "- Dragon Age Inquisition\\*\n[Final Fantasy IV](https://youtu.be/x)\n- [ ] beat it\n\n",
      "2026-10-19",
    );
    expect(entries.map((e) => e.title)).toEqual([
      "Dragon Age Inquisition",
      "Final Fantasy IV",
    ]);
    expect(entries.every((e) => e.finishedOn === null)).toBe(true);
  });
});

describe("normaliseTitle", () => {
  it("ignores accents, case and punctuation", () => {
    expect(normaliseTitle("Pokémon: Soul Silver")).toBe(
      normaliseTitle("pokemon soul  silver"),
    );
  });
});
