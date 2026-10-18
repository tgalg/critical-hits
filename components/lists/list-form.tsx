"use client";

import { useActionState, useId } from "react";
import { saveList, type ListFormState } from "@/app/lists/actions";
import { listLimits } from "@/lib/lists/input";

export type ListFormDefaults = {
  title: string;
  description: string;
  isRanked: boolean;
  isPublic: boolean;
};

const emptyList: ListFormDefaults = {
  title: "",
  description: "",
  isRanked: false,
  isPublic: true,
};

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-destructive";

export function ListForm({
  listId,
  defaults = emptyList,
  submitLabel,
}: {
  listId?: number;
  defaults?: ListFormDefaults;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<ListFormState, FormData>(
    saveList,
    { status: "idle", version: 0 },
  );
  // After an error the form shows what was typed; otherwise the saved list.
  const typed = state.values;
  const value = (name: "title" | "description") =>
    typed ? (typed[name] ?? "") : defaults[name];
  const checked = (name: "isRanked" | "isPublic") =>
    typed ? typed[name] === "on" : defaults[name];
  const id = useId();
  const field = (name: "title" | "description") => ({
    id: `${id}-${name}`,
    name,
    defaultValue: value(name),
    maxLength: listLimits[name],
    className: inputClass,
    ...(state.errors?.[name]
      ? { "aria-invalid": true, "aria-describedby": `${id}-${name}-error` }
      : {}),
  });
  const error = (name: "title" | "description") =>
    state.errors?.[name] && (
      <p id={`${id}-${name}-error`} className="text-xs text-destructive">
        {state.errors[name]}
      </p>
    );

  return (
    <form key={state.version} action={action} className="space-y-4">
      {listId && <input type="hidden" name="listId" value={listId} />}
      <div className="space-y-1.5 text-sm">
        <label htmlFor={`${id}-title`} className="block font-medium">
          Title
        </label>
        <input {...field("title")} />
        {error("title")}
      </div>
      <div className="space-y-1.5 text-sm">
        <label htmlFor={`${id}-description`} className="block font-medium">
          Description
        </label>
        <textarea rows={3} placeholder="Optional" {...field("description")} />
        {error("description")}
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isRanked"
            defaultChecked={checked("isRanked")}
          />
          <span>Ranked</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isPublic"
            defaultChecked={checked("isPublic")}
          />
          <span>Public</span>
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
