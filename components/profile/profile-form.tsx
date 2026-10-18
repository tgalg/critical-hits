"use client";

import { useActionState, useId } from "react";
import { saveProfile, type ProfileFormState } from "@/app/account/actions";
import { profileLimits } from "@/lib/profile/input";

type Field = "username" | "displayName" | "bio";

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary aria-invalid:border-destructive";

export function ProfileForm({ defaults }: { defaults: Record<Field, string> }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    saveProfile,
    { status: "idle", version: 0 },
  );
  const id = useId();
  const props = (name: Field) => ({
    id: `${id}-${name}`,
    name,
    defaultValue: state.values ? (state.values[name] ?? "") : defaults[name],
    className: inputClass,
    ...(state.errors?.[name]
      ? { "aria-invalid": true, "aria-describedby": `${id}-${name}-error` }
      : {}),
  });
  const field = (name: Field, label: string, control: React.ReactNode) => (
    <div className="space-y-1.5 text-sm">
      <label htmlFor={`${id}-${name}`} className="block font-medium">
        {label}
      </label>
      {control}
      {state.errors?.[name] && (
        <p id={`${id}-${name}-error`} className="text-xs text-destructive">
          {state.errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form key={state.version} action={action} className="space-y-4">
      {field(
        "username",
        "Username",
        <input {...props("username")} autoComplete="username" maxLength={30} />,
      )}
      {field(
        "displayName",
        "Display name",
        <input
          {...props("displayName")}
          placeholder="Optional"
          maxLength={profileLimits.displayName}
        />,
      )}
      {field(
        "bio",
        "Bio",
        <textarea
          {...props("bio")}
          rows={3}
          placeholder="Optional"
          maxLength={profileLimits.bio}
        />,
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
        Save profile
      </button>
    </form>
  );
}
