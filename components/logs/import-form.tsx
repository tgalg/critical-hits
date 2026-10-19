"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importAction, type ImportState } from "@/app/diary/import/actions";
import { formatDate } from "@/components/logs/log-details";

const button =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";
const secondaryButton =
  "rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50";

const example = `2023
Hollow Knight
The Last of Us Part II
2024
Astro Bot
2024-11-02 Final Fantasy IX`;

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    importAction,
    { version: 0, text: "" },
  );
  const rows = state.rows ?? [];
  const matched = rows.filter((row) => row.game);
  const missing = rows.filter((row) => !row.game);

  return (
    <form key={state.version} action={action} className="space-y-6">
      {state.imported !== undefined && (
        <p role="status" className="rounded-md border p-3 text-sm">
          Added {state.imported} {state.imported === 1 ? "play" : "plays"} to
          your{" "}
          <Link href="/diary" className="underline">
            diary
          </Link>
          .
        </p>
      )}
      <div className="space-y-1.5 text-sm">
        <label htmlFor="import-text" className="block font-medium">
          Games you&apos;ve finished
        </label>
        <p className="text-muted-foreground">
          One game per line. Put a year on its own line above the games you
          finished that year, oldest first, or start a line with the exact date
          (2024-11-02). Add the release year in brackets to pick a remake, like
          Resident Evil 2 (2019).
        </p>
        <textarea
          id="import-text"
          name="text"
          rows={12}
          defaultValue={state.text}
          placeholder={example}
          className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>
      {state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        name="intent"
        value="preview"
        disabled={pending}
        className={rows.length ? secondaryButton : button}
      >
        Check matches
      </button>

      {rows.length > 0 && (
        <section className="space-y-4">
          <input
            type="hidden"
            name="previewedText"
            value={state.previewedText}
          />
          <h2 className="text-lg font-semibold">
            {matched.length} of {rows.length} found
          </h2>
          <p className="text-sm text-muted-foreground">
            Untick anything that matched the wrong game. Games with only a year
            get dates spread across that year in the order you listed them.
          </p>
          <ul className="divide-y rounded-lg border">
            {matched.map((row) => (
              <li
                key={row.index}
                className="flex items-start gap-3 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  name="include"
                  value={row.index}
                  defaultChecked={!row.duplicate}
                  disabled={row.duplicate}
                  aria-label={`Import ${row.line}`}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <p>
                    <Link
                      href={`/games/${row.game!.slug}`}
                      className="font-medium hover:underline"
                      target="_blank"
                    >
                      {row.game!.title}
                    </Link>
                    {row.game!.releaseYear && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({row.game!.releaseYear})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.match === "close" && (
                      <>Closest match for “{row.line}” · </>
                    )}
                    {row.finishedOn
                      ? `Finished ${row.approximateDate ? row.finishedOn.slice(0, 4) : formatDate(row.finishedOn)}`
                      : "No date"}
                    {row.duplicate && " · Already in your diary"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {missing.length > 0 && (
            <div className="space-y-2 text-sm">
              <h3 className="font-medium">Not found in the catalog</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {missing.map((row) => (
                  <li key={row.index}>{row.line}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="submit"
            name="intent"
            value="import"
            disabled={pending}
            className={button}
          >
            Import ticked games
          </button>
        </section>
      )}
    </form>
  );
}
