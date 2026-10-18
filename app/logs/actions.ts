"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { parseLogForm, type LogErrors } from "@/lib/logs/input";
import { createLog, deleteLog, LogError, updateLog } from "@/lib/logs/service";

export type LogFormState = {
  status: "idle" | "saved" | "error";
  // Bumped on every submission so the form remounts with the right defaults.
  version: number;
  message?: string;
  errors?: LogErrors;
  // What the player typed, so an invalid form keeps their input.
  values?: Record<string, string>;
};

async function requireUserId() {
  // Headers first: getAuth() connects to the database, which must not happen
  // while a page is being prerendered at build time.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in");
  return session.user.id;
}

const idFrom = (form: FormData, name: string) => {
  const id = Number(form.get(name));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

function refresh(slug: FormDataEntryValue | null) {
  if (typeof slug === "string" && slug) revalidatePath(`/games/${slug}`);
  revalidatePath("/diary");
}

// Creates a log when the form carries a gameId, or updates one when it
// carries a logId. Ownership is checked in the service, never trusted here.
export async function saveLog(
  previous: LogFormState,
  form: FormData,
): Promise<LogFormState> {
  const userId = await requireUserId();
  const version = previous.version + 1;
  const failed = (message: string, errors?: LogErrors): LogFormState => ({
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
  const parsed = parseLogForm(form);
  if (!parsed.ok) return failed("Check the highlighted fields.", parsed.errors);
  const logId = idFrom(form, "logId");
  const gameId = idFrom(form, "gameId");
  try {
    if (logId) await updateLog(getDatabase(), userId, logId, parsed.value);
    else if (gameId)
      await createLog(getDatabase(), userId, gameId, parsed.value);
    else return failed("Something went wrong. Try again.");
  } catch (error) {
    if (error instanceof LogError) return failed(error.message);
    throw error;
  }
  refresh(form.get("slug"));
  if (logId) redirect("/diary");
  return { status: "saved", version, message: "Logged." };
}

export async function removeLog(form: FormData) {
  const userId = await requireUserId();
  const logId = idFrom(form, "logId");
  if (logId) {
    try {
      await deleteLog(getDatabase(), userId, logId);
    } catch (error) {
      if (!(error instanceof LogError)) throw error;
    }
  }
  refresh(form.get("slug"));
  redirect("/diary");
}
