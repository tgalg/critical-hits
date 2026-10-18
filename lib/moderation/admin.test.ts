import { describe, expect, it } from "vitest";
import { adminEmails, isAdmin } from "@/lib/moderation/admin";

describe("isAdmin", () => {
  const emails = adminEmails(" Mod@Example.com, other@example.com ,");

  it("matches listed emails regardless of case and spacing", () => {
    expect(
      isAdmin({ email: "mod@example.com", emailVerified: true }, emails),
    ).toBe(true);
    expect(
      isAdmin({ email: "OTHER@example.com", emailVerified: true }, emails),
    ).toBe(true);
  });

  it("ignores unverified emails and unlisted players", () => {
    expect(
      isAdmin({ email: "mod@example.com", emailVerified: false }, emails),
    ).toBe(false);
    expect(
      isAdmin({ email: "ana@example.com", emailVerified: true }, emails),
    ).toBe(false);
  });

  it("names nobody when the setting is empty or missing", () => {
    expect(adminEmails("").size).toBe(0);
    expect(adminEmails(undefined).size).toBe(0);
  });
});
