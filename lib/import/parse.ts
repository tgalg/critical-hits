// Turns a pasted list of finished games into import entries. The list is
// what players already keep in notes apps: a year on its own line (or as a
// heading) followed by the games finished that year, oldest first.

export const importLineLimit = 500;

export type ImportEntry = {
  // The line's position among the entries, used to pick which ones to import.
  index: number;
  // The line as written, for showing what each match came from.
  line: string;
  title: string;
  // A release year written as "Title (2019)", to tell remakes from originals.
  releaseYear: number | null;
  finishedOn: string | null;
  // True when the list only gave the year and the day was filled in.
  approximateDate: boolean;
};

const day = 24 * 60 * 60 * 1000;
const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

const yearHeading = /^#*\s*(\d{4})\s*:?$/;
const datedLine = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/;
const releaseHint = /\s*\((\d{4})\)$/;

function isIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// Removes what notes apps leave around a title: list markers, markdown
// links and emphasis, and footnote asterisks.
function cleanLine(raw: string) {
  return raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/\\?\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Lowercase letters and digits only, so "Pokémon: Soul Silver" and
// "Pokemon Soul Silver" compare equal.
export function normaliseTitle(title: string) {
  return title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Spreads a year's games evenly over the year in the order listed, ending
// at today for the current year, so the diary keeps the list's order.
function spreadDates(year: number, count: number, today: string) {
  const start = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year, 11, 31);
  const todayTime = new Date(`${today}T00:00:00Z`).getTime();
  const end = Math.max(start, Math.min(yearEnd, todayTime));
  const span = (end - start) / day;
  return Array.from({ length: count }, (_, i) =>
    isoDate(start + Math.round(((i + 1) * span) / (count + 1)) * day),
  );
}

export const importLineCount = (text: string) => text.split(/\r?\n/).length;

export function parseImportText(text: string, today: string): ImportEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: ImportEntry[] = [];
  // Entries under each year heading that still need a date.
  const undated = new Map<number, ImportEntry[]>();
  let year: number | null = null;

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line || /^\[[ x]?\]/i.test(line)) continue;
    const heading = yearHeading.exec(line);
    if (heading) {
      year = Number(heading[1]);
      continue;
    }
    let title = line;
    let finishedOn: string | null = null;
    const dated = datedLine.exec(line);
    if (dated && isIsoDate(dated[1])) {
      finishedOn = dated[1];
      title = dated[2];
    }
    let releaseYear: number | null = null;
    const hint = releaseHint.exec(title);
    if (hint) {
      releaseYear = Number(hint[1]);
      title = title.slice(0, hint.index).trim();
    }
    if (!normaliseTitle(title)) continue;
    const entry: ImportEntry = {
      index: entries.length,
      line,
      title,
      releaseYear,
      finishedOn,
      approximateDate: false,
    };
    entries.push(entry);
    if (!finishedOn && year !== null) {
      undated.set(year, [...(undated.get(year) ?? []), entry]);
    }
  }

  for (const [sectionYear, section] of undated) {
    const dates = spreadDates(sectionYear, section.length, today);
    section.forEach((entry, i) => {
      entry.finishedOn = dates[i];
      entry.approximateDate = true;
    });
  }
  return entries;
}
