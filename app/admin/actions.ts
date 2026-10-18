"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db";
import {
  dismissReports,
  hideReview,
  ModerationError,
  reportReview,
  unhideReview,
} from "@/lib/moderation/service";
import { isReportReason } from "@/lib/moderation/reasons";
import { getCurrentAdmin, requireUserId } from "@/lib/session";

export type ReportState = { version: number; done?: boolean; message?: string };

const reviewIdFrom = (form: FormData) => {
  const id = Number(form.get("reviewId"));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

// The reporter is always the session's player.
export async function reportReviewAction(
  previous: ReportState,
  form: FormData,
): Promise<ReportState> {
  const userId = await requireUserId();
  const version = previous.version + 1;
  const reviewId = reviewIdFrom(form);
  const reason = form.get("reason");
  if (!reviewId || !isReportReason(reason)) {
    return { version, message: "Pick a reason." };
  }
  try {
    const filed = await reportReview(getDatabase(), userId, reviewId, reason);
    return {
      version,
      done: true,
      message: filed
        ? "Thanks. A moderator will take a look."
        : "You already reported this review.",
    };
  } catch (error) {
    if (error instanceof ModerationError) {
      return { version, message: error.message };
    }
    throw error;
  }
}

// Moderator actions answer everyone else as if the page didn't exist.
async function moderate(
  form: FormData,
  act: (db: ReturnType<typeof getDatabase>, reviewId: number) => Promise<void>,
) {
  if (!(await getCurrentAdmin())) notFound();
  const reviewId = reviewIdFrom(form);
  if (reviewId) await act(getDatabase(), reviewId);
  // A hidden or restored review shows up on game pages, profiles and feeds.
  revalidatePath("/", "layout");
  redirect("/admin");
}

export async function hideReviewAction(form: FormData) {
  await moderate(form, hideReview);
}

export async function dismissReportsAction(form: FormData) {
  await moderate(form, dismissReports);
}

export async function unhideReviewAction(form: FormData) {
  await moderate(form, unhideReview);
}
