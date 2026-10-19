"use client";

import Link from "next/link";
import { useActionState, useId, useRef, useState } from "react";
import { saveLog, type LogFormState } from "@/app/logs/actions";
import { reviewMaxLength } from "@/lib/logs/input";

export type LogFormDefaults = {
  status: string;
  platformId: string;
  startedOn: string;
  finishedOn: string;
  hours: string;
  rating: string;
  hearted: boolean;
  isReplay: boolean;
  review: string;
  containsSpoilers: boolean;
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
  review: "",
  containsSpoilers: false,
};

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-destructive";

// A pill wrapping an invisible radio or checkbox that covers it, so clicks
// land on the input itself; it lights up when checked and shows a ring when
// focused from the keyboard.
const pillClass =
  "relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors select-none hover:bg-muted has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-primary";

const pillInput =
  "absolute inset-0 m-0 cursor-pointer appearance-none rounded-full opacity-0";

// More platforms than this get a dropdown instead of a row of pills.
const maxPlatformPills = 8;

// The hours slider's top end; longer playtimes go in the number box.
const sliderMaxHours = 200;

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
      <FieldError id={id} error={error} />
    </div>
  );
}

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={`${id}-error`} className="text-xs text-destructive">
      {error}
    </p>
  ) : null;
}

// A row of choices that reads as one labelled group.
function PillGroup({
  id,
  legend,
  error,
  children,
}: {
  id: string;
  legend: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      className="space-y-1.5 text-sm"
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="mb-1.5 font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
      <FieldError id={id} error={error} />
    </fieldset>
  );
}

function Star({ fill }: { fill: 0 | 0.5 | 1 }) {
  return (
    <span aria-hidden className="relative inline-block text-3xl leading-none">
      <span className="text-muted-foreground/30">★</span>
      <span
        className="absolute inset-0 overflow-hidden text-primary"
        style={{ width: `${fill * 100}%` }}
      >
        ★
      </span>
    </span>
  );
}

// Five stars, each split into halves, so a rating is one click. Each half is
// a real radio (values 1 to 10, in half stars), so the arrow keys and screen
// readers work as they do for any radio group.
function StarRating({
  id,
  defaultValue,
  error,
}: {
  id: string;
  defaultValue: string;
  error?: string;
}) {
  const [value, setValue] = useState(
    defaultValue ? Number(defaultValue) : null,
  );
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const label = (n: number) => `${n / 2} ${n === 2 ? "star" : "stars"}`;
  return (
    <PillGroup id={id} legend="Rating" error={error}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex" onMouseLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((star) => {
            const fill =
              shown >= star * 2 ? 1 : shown === star * 2 - 1 ? 0.5 : 0;
            return (
              <span
                key={star}
                className="relative rounded-sm has-focus-visible:ring-2 has-focus-visible:ring-primary"
              >
                <Star fill={fill} />
                {/* Each half is itself the (invisible) radio, so a click
                    lands exactly on the value under the pointer. */}
                {[star * 2 - 1, star * 2].map((n) => (
                  <input
                    key={n}
                    type="radio"
                    name="rating"
                    value={n}
                    checked={value === n}
                    onChange={() => setValue(n)}
                    onMouseEnter={() => setHover(n)}
                    aria-label={label(n)}
                    className={`absolute inset-y-0 m-0 w-1/2 cursor-pointer appearance-none opacity-0 ${n % 2 ? "left-0" : "right-0"}`}
                  />
                ))}
              </span>
            );
          })}
        </div>
        <span className="min-w-20 text-muted-foreground" aria-live="polite">
          {shown ? label(shown) : "No rating"}
        </span>
        {value !== null && (
          <button
            type="button"
            onClick={() => setValue(null)}
            className="text-xs whitespace-nowrap underline"
          >
            Clear rating
          </button>
        )}
      </div>
    </PillGroup>
  );
}

// A number box for exact hours, with a slider for quick, rough ones.
function HoursInput({
  id,
  defaultValue,
  error,
  invalid,
}: {
  id: string;
  defaultValue: string;
  error?: string;
  invalid: object;
}) {
  const [hours, setHours] = useState(defaultValue);
  const numeric = Number(hours);
  const slider = Number.isFinite(numeric)
    ? Math.min(Math.max(numeric, 0), sliderMaxHours)
    : 0;
  return (
    <Field id={id} label="Hours played" error={error}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={sliderMaxHours}
          step={1}
          value={slider}
          onChange={(event) => setHours(event.target.value)}
          aria-label="Hours played slider"
          className="min-w-0 flex-1 accent-primary"
        />
        <input
          id={id}
          name="hours"
          inputMode="decimal"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          placeholder="0"
          className={`${inputClass.replace("w-full ", "")} w-24 shrink-0 text-right`}
          {...invalid}
        />
        <span className="text-muted-foreground">h</span>
      </div>
    </Field>
  );
}

function todayIso() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function LogForm({
  gameId,
  logId,
  slug,
  platforms,
  statuses,
  defaults = emptyLog,
  reviewedLogId = null,
  submitLabel,
}: {
  gameId?: number;
  logId?: number;
  slug: string;
  platforms: { id: number; name: string }[];
  statuses: { value: string; label: string }[];
  defaults?: LogFormDefaults;
  // Another of the player's plays of this game that already has the review.
  reviewedLogId?: number | null;
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
  const checked = (name: "hearted" | "isReplay" | "containsSpoilers") =>
    typed ? typed[name] === "on" : defaults[name];
  const error = (name: string) =>
    state.errors?.[name as keyof typeof state.errors];
  const id = useId();
  const describe = (name: string) =>
    error(name)
      ? { "aria-invalid": true, "aria-describedby": `${id}-${name}-error` }
      : {};
  const finishedRef = useRef<HTMLInputElement>(null);

  return (
    <form key={state.version} action={action} className="space-y-6">
      {gameId && <input type="hidden" name="gameId" value={gameId} />}
      {logId && <input type="hidden" name="logId" value={logId} />}
      <input type="hidden" name="slug" value={slug} />

      <PillGroup id={`${id}-status`} legend="Status" error={error("status")}>
        {statuses.map((status) => (
          <label key={status.value} className={pillClass}>
            <input
              type="radio"
              name="status"
              value={status.value}
              defaultChecked={value("status") === status.value}
              className={pillInput}
            />
            {status.label}
          </label>
        ))}
      </PillGroup>

      <StarRating
        id={`${id}-rating`}
        defaultValue={value("rating")}
        error={error("rating")}
      />

      {platforms.length <= maxPlatformPills ? (
        <PillGroup
          id={`${id}-platformId`}
          legend="Platform"
          error={error("platformId")}
        >
          {[{ id: "", name: "Not specified" }, ...platforms].map((platform) => (
            <label key={platform.id} className={pillClass}>
              <input
                type="radio"
                name="platformId"
                value={platform.id}
                defaultChecked={value("platformId") === String(platform.id)}
                className={pillInput}
              />
              {platform.name}
            </label>
          ))}
        </PillGroup>
      ) : (
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
      )}

      <HoursInput
        id={`${id}-hours`}
        defaultValue={value("hours")}
        error={error("hours")}
        invalid={describe("hours")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
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
          <div className="flex gap-2">
            <input
              ref={finishedRef}
              id={`${id}-finishedOn`}
              name="finishedOn"
              type="date"
              defaultValue={value("finishedOn")}
              className={inputClass}
              {...describe("finishedOn")}
            />
            <button
              type="button"
              onClick={() => {
                if (finishedRef.current) finishedRef.current.value = todayIso();
              }}
              className="rounded-md border px-3 text-xs hover:bg-muted"
            >
              Today
            </button>
          </div>
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className={pillClass}>
          <input
            type="checkbox"
            name="hearted"
            defaultChecked={checked("hearted")}
            className={pillInput}
          />
          <span aria-hidden>♥</span> Loved it
        </label>
        <label className={pillClass}>
          <input
            type="checkbox"
            name="isReplay"
            defaultChecked={checked("isReplay")}
            className={pillInput}
          />
          <span aria-hidden>↻</span> Replay
        </label>
      </div>

      {reviewedLogId !== null ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          You&apos;ve already reviewed this game.{" "}
          <Link href={`/logs/${reviewedLogId}/edit`} className="underline">
            Edit your review
          </Link>{" "}
          to change it.
        </p>
      ) : (
        <div className="space-y-3">
          <Field id={`${id}-review`} label="Review" error={error("review")}>
            <textarea
              id={`${id}-review`}
              name="review"
              rows={5}
              maxLength={reviewMaxLength}
              defaultValue={value("review")}
              placeholder="Optional. What did you think?"
              className={inputClass}
              {...describe("review")}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="containsSpoilers"
              defaultChecked={checked("containsSpoilers")}
            />
            <span>Contains spoilers</span>
          </label>
        </div>
      )}

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
