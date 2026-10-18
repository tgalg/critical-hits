import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("combines conditional classes and lets the last Tailwind utility win", () => {
    expect(
      cn("px-2 text-sm", false && "hidden", { "font-bold": true }, "px-6"),
    ).toBe("text-sm font-bold px-6");
  });
});
