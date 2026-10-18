import type { LogFormDefaults } from "@/components/logs/log-form";
import { statusLabels, type LogStatus } from "@/lib/logs/input";

export const statusOptions = Object.entries(statusLabels).map(
  ([value, label]) => ({ value, label }),
);

// Turns a stored log into the strings the log form starts from.
export function logFormDefaults(log: {
  status: LogStatus;
  platformId: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  hours: string | null;
  rating: number | null;
  hearted: boolean;
  isReplay: boolean;
  review: { body: string; containsSpoilers: boolean } | null;
}): LogFormDefaults {
  return {
    status: log.status,
    platformId: log.platformId === null ? "" : String(log.platformId),
    startedOn: log.startedOn ?? "",
    finishedOn: log.finishedOn ?? "",
    hours: log.hours === null ? "" : String(Number(log.hours)),
    rating: log.rating === null ? "" : String(log.rating),
    hearted: log.hearted,
    isReplay: log.isReplay,
    review: log.review?.body ?? "",
    containsSpoilers: log.review?.containsSpoilers ?? false,
  };
}
