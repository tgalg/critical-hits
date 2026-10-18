"use client";

import { useActionState } from "react";
import { reportReviewAction, type ReportState } from "@/app/admin/actions";
import { reasonLabels, reportReasons } from "@/lib/moderation/reasons";

// A small "Report" disclosure under a review: pick a reason and send it.
export function ReportButton({
  reviewId,
  label,
}: {
  reviewId: number;
  label: string;
}) {
  const [state, action, pending] = useActionState<ReportState, FormData>(
    reportReviewAction,
    { version: 0 },
  );
  if (state.done) {
    return (
      <span role="status" className="text-xs text-muted-foreground">
        {state.message}
      </span>
    );
  }
  return (
    <details className="text-xs text-muted-foreground">
      <summary
        className="cursor-pointer hover:text-foreground"
        aria-label={`Report ${label}`}
      >
        Report
      </summary>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="reviewId" value={reviewId} />
        <label className="flex items-center gap-2">
          <span>Reason</span>
          <select
            name="reason"
            required
            defaultValue=""
            className="rounded-md border bg-background px-2 py-1 text-foreground"
          >
            <option value="" disabled>
              Choose one
            </option>
            {reportReasons.map((reason) => (
              <option key={reason} value={reason}>
                {reasonLabels[reason]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border px-2 py-1 text-foreground disabled:opacity-60"
        >
          Send report
        </button>
        {state.message && <span role="status">{state.message}</span>}
      </form>
    </details>
  );
}
