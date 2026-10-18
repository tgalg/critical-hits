export const reportReasons = ["spam", "abuse", "spoilers", "other"] as const;
export type ReportReason = (typeof reportReasons)[number];

export const reasonLabels: Record<ReportReason, string> = {
  spam: "Spam",
  abuse: "Abusive or hateful",
  spoilers: "Unmarked spoilers",
  other: "Something else",
};

export function isReportReason(value: unknown): value is ReportReason {
  return reportReasons.includes(value as ReportReason);
}
