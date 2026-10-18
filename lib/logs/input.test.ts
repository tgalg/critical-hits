import { describe, expect, it } from "vitest";
import { logStatus } from "@/lib/db/schema";
import { parseLogForm, stars, statusLabels } from "@/lib/logs/input";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

describe("parseLogForm", () => {
  it("parses a full log", () => {
    expect(
      parseLogForm(
        form({
          status: "finished",
          platformId: "4",
          startedOn: "2026-01-02",
          finishedOn: "2026-02-03",
          hours: " 41.5 ",
          rating: "9",
          hearted: "on",
          isReplay: "on",
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        status: "finished",
        platformId: 4,
        startedOn: "2026-01-02",
        finishedOn: "2026-02-03",
        hours: "41.5",
        rating: 9,
        hearted: true,
        isReplay: true,
      },
    });
  });

  it("treats blank optional fields as empty", () => {
    expect(
      parseLogForm(
        form({ status: "playing", platformId: "", rating: "", hours: "" }),
      ),
    ).toEqual({
      ok: true,
      value: {
        status: "playing",
        platformId: null,
        startedOn: null,
        finishedOn: null,
        hours: null,
        rating: null,
        hearted: false,
        isReplay: false,
      },
    });
  });

  it("reports each invalid field", () => {
    const result = parseLogForm(
      form({
        status: "beaten",
        platformId: "pc",
        startedOn: "2026-02-30",
        finishedOn: "yesterday",
        hours: "-3",
        rating: "11",
      }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      "finishedOn",
      "hours",
      "platformId",
      "rating",
      "startedOn",
      "status",
    ]);
  });

  it("rejects a finish date before the start date", () => {
    const result = parseLogForm(
      form({
        status: "finished",
        startedOn: "2026-03-01",
        finishedOn: "2026-02-01",
      }),
    );
    expect(result).toEqual({
      ok: false,
      errors: { finishedOn: "The finish date can't be before the start date." },
    });
  });

  it("rejects half ratings and too many decimals", () => {
    const result = parseLogForm(
      form({ status: "finished", rating: "4.5", hours: "1.25" }),
    );
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      "hours",
      "rating",
    ]);
  });
});

describe("display helpers", () => {
  it("labels every status in the schema", () => {
    expect(Object.keys(statusLabels).sort()).toEqual(
      [...logStatus.enumValues].sort(),
    );
  });

  it("shows half-star ratings as stars", () => {
    expect(stars(1)).toBe("½");
    expect(stars(7)).toBe("★★★½");
    expect(stars(10)).toBe("★★★★★");
  });
});
