"use client";

import { useActionState, useId } from "react";
import { saveLog, type LogFormState } from "@/app/logs/actions";

export type LogFormDefaults = {
  status: string;
  platformId: string;
  startedOn: string;
  finishedOn: string;
  hours: string;
  rating: string;
  hearted: boolean;
  isReplay: boolean;
};

export const emptyLog: LogFormDefaults = {
  status: "finished",
  platformId: "",
  startedOn: "",
  finishedOn: "",
  hours: "",
  rating: "",
  hearted: false,
  isReplay: false,
};

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-destructive";

const ratingOptions = Array.from({ length: 10 }, (_, i) => {
  const value = i + 1;
  const label = `${value / 2} ${value === 2 ? "star" : "stars"}`;
  return { value: String(value), label };
});

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 text-sm">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function LogForm({
  gameId,
  logId,
  slug,
  platforms,
  statuses,
  defaults = emptyLog,
  submitLabel,
}: {
  gameId?: number;
  logId?: number;
  slug: string;
  platforms: { id: number; name: string }[];
  statuses: { value: string; label: string }[];
  defaults?: LogFormDefaults;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<LogFormState, FormData>(
    saveLog,
    { status: "idle", version: 0 },
  );
  // After an error the form shows what was typed; after a save it starts over.
  const typed = state.values;
  const value = (name: keyof LogFormDefaults) =>
    typed ? (typed[name] ?? "") : String(defaults[name]);
  const checked = (name: "hearted" | "isReplay") =>
    typed ? typed[name] === "on" : defaults[name];
  const error = (name: string) =>
    state.errors?.[name as keyof typeof state.errors];
  const id = useId();
  const describe = (name: string) =>
    error(name)
      ? { "aria-invalid": true, "aria-describedby": `${id}-${name}-error` }
      : {};

  return (
    <form key={state.version} action={action} className="space-y-4">
      {gameId && <input type="hidden" name="gameId" value={gameId} />}
      {logId && <input type="hidden" name="logId" value={logId} />}
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-status`} label="Status" error={error("status")}>
          <select
            id={`${id}-status`}
            name="status"
            defaultValue={value("status")}
            className={inputClass}
            {...describe("status")}
          >
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </Field>

        <Field id={`${id}-rating`} label="Rating" error={error("rating")}>
          <select
            id={`${id}-rating`}
            name="rating"
            defaultValue={value("rating")}
            className={inputClass}
            {...describe("rating")}
          >
            <option value="">No rating</option>
            {ratingOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id={`${id}-platformId`}
          label="Platform"
          error={error("platformId")}
        >
          <select
            id={`${id}-platformId`}
            name="platformId"
            defaultValue={value("platformId")}
            className={inputClass}
            {...describe("platformId")}
          >
            <option value="">Not specified</option>
            {platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </select>
        </Field>

        <Field id={`${id}-hours`} label="Hours played" error={error("hours")}>
          <input
            id={`${id}-hours`}
            name="hours"
            inputMode="decimal"
            defaultValue={value("hours")}
            className={inputClass}
            {...describe("hours")}
          />
        </Field>

        <Field
          id={`${id}-startedOn`}
          label="Started"
          error={error("startedOn")}
        >
          <input
            id={`${id}-startedOn`}
            name="startedOn"
            type="date"
            defaultValue={value("startedOn")}
            className={inputClass}
            {...describe("startedOn")}
          />
        </Field>

        <Field
          id={`${id}-finishedOn`}
          label="Finished"
          error={error("finishedOn")}
        >
          <input
            id={`${id}-finishedOn`}
            name="finishedOn"
            type="date"
            defaultValue={value("finishedOn")}
            className={inputClass}
            {...describe("finishedOn")}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="hearted"
            defaultChecked={checked("hearted")}
          />
          <span>Favourite ♥</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isReplay"
            defaultChecked={checked("isReplay")}
          />
          <span>Replay</span>
        </label>
      </div>

      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </form>
  );
}
