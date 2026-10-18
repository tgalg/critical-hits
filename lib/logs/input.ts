import { logStatus } from "@/lib/db/schema";

export type LogStatus = (typeof logStatus.enumValues)[number];

export const statusLabels: Record<LogStatus, string> = {
  playing: "Playing",
  finished: "Finished",
  dropped: "Dropped",
  shelved: "Shelved",
};

export type LogInput = {
  status: LogStatus;
  platformId: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  // Kept as text so numeric(6,1) never sees float rounding.
  hours: string | null;
  // 1-10 half-stars, shown as 0.5-5 stars.
  rating: number | null;
  hearted: boolean;
  isReplay: boolean;
};

export type LogField = keyof LogInput;
export type LogErrors = Partial<Record<LogField, string>>;

export type ParsedLog =
  { ok: true; value: LogInput } | { ok: false; errors: LogErrors };

type FormLike = { get(name: string): FormDataEntryValue | null };

const text = (form: FormLike, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

// A real calendar date in YYYY-MM-DD form; Date would roll 2026-02-30 over.
function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// Validates the log form. The database repeats the range and date-order
// checks, so this exists to give the player readable errors.
export function parseLogForm(form: FormLike): ParsedLog {
  const errors: LogErrors = {};

  const status = text(form, "status");
  if (!(logStatus.enumValues as readonly string[]).includes(status)) {
    errors.status = "Choose a status.";
  }

  const platform = text(form, "platformId");
  const platformId = platform ? Number(platform) : null;
  if (platformId !== null && !Number.isSafeInteger(platformId)) {
    errors.platformId = "Choose a platform from the list.";
  }

  const dates = {
    startedOn: text(form, "startedOn"),
    finishedOn: text(form, "finishedOn"),
  };
  for (const field of ["startedOn", "finishedOn"] as const) {
    if (dates[field] && !isIsoDate(dates[field])) {
      errors[field] = "Enter a valid date.";
    }
  }
  if (
    !errors.startedOn &&
    !errors.finishedOn &&
    dates.startedOn &&
    dates.finishedOn &&
    dates.finishedOn < dates.startedOn
  ) {
    errors.finishedOn = "The finish date can't be before the start date.";
  }

  const hours = text(form, "hours");
  if (hours && !/^\d{1,5}(\.\d)?$/.test(hours)) {
    errors.hours = "Enter hours as a number with at most one decimal place.";
  }

  const ratingText = text(form, "rating");
  const rating = ratingText ? Number(ratingText) : null;
  if (
    rating !== null &&
    !(Number.isInteger(rating) && rating >= 1 && rating <= 10)
  ) {
    errors.rating = "Choose a rating from half a star to five stars.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      status: status as LogStatus,
      platformId,
      startedOn: dates.startedOn || null,
      finishedOn: dates.finishedOn || null,
      hours: hours || null,
      rating,
      hearted: form.get("hearted") === "on",
      isReplay: form.get("isReplay") === "on",
    },
  };
}

// 1-10 half-stars as a star string, e.g. 7 -> "★★★½".
export function stars(rating: number) {
  return "★".repeat(Math.floor(rating / 2)) + (rating % 2 ? "½" : "");
}
