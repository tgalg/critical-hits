"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { chooseUsername, type HandleFormState } from "@/app/account/actions";

export function HandleForm({
  current,
  skipHref,
  skipLabel,
}: {
  current: string;
  skipHref: string;
  skipLabel: string;
}) {
  const [state, action, pending] = useActionState<HandleFormState, FormData>(
    chooseUsername,
    {},
  );
  const [value, setValue] = useState(current);
  const id = useId();

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5 text-sm">
        <label htmlFor={`${id}-username`} className="block font-medium">
          Username
        </label>
        <div className="flex items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-primary has-aria-invalid:border-destructive">
          <span aria-hidden className="pl-3 text-muted-foreground">
            @
          </span>
          <input
            id={`${id}-username`}
            name="username"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            autoFocus
            required
            className="w-full bg-transparent py-2 pr-3 pl-0.5 text-base outline-none sm:text-sm"
            {...(state.error
              ? { "aria-invalid": true, "aria-describedby": `${id}-error` }
              : { "aria-describedby": `${id}-hint` })}
          />
        </div>
        {state.error ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="text-xs text-destructive"
          >
            {state.error}
          </p>
        ) : (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            Your profile will live at /u/{value.trim() || "…"}. Letters,
            numbers, underscores and dots.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          Save username
        </button>
        <Link
          href={skipHref}
          className="text-sm text-muted-foreground underline"
        >
          {skipLabel}
        </Link>
      </div>
    </form>
  );
}
