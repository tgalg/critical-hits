import { statusLabels, stars, type LogStatus } from "@/lib/logs/input";

const dateFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export const formatDate = (isoDate: string) =>
  dateFormat.format(new Date(`${isoDate}T00:00:00Z`));

// The facts of one play as a compact line: status, rating, heart, platform,
// dates and hours. Everything but the status is optional.
export function LogDetails({
  log,
}: {
  log: {
    status: LogStatus;
    rating: number | null;
    hearted: boolean;
    isReplay: boolean;
    platform: string | null;
    startedOn: string | null;
    finishedOn: string | null;
    hours: string | null;
  };
}) {
  const dates = [log.startedOn, log.finishedOn].filter(
    (date): date is string => date !== null,
  );
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">
        {statusLabels[log.status]}
      </span>
      {log.rating !== null && (
        <span
          className="text-primary"
          aria-label={`Rated ${log.rating / 2} out of 5`}
        >
          {stars(log.rating)}
        </span>
      )}
      {log.hearted && (
        <span className="text-red-500" aria-label="Favourite">
          ♥
        </span>
      )}
      {log.isReplay && <span>Replay</span>}
      {log.platform && <span>{log.platform}</span>}
      {dates.length > 0 && <span>{dates.map(formatDate).join(" – ")}</span>}
      {log.hours !== null && <span>{Number(log.hours)} h</span>}
    </p>
  );
}
