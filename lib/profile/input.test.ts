import { describe, expect, it } from "vitest";
import { parseProfileForm, profileLimits } from "@/lib/profile/input";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

describe("parseProfileForm", () => {
  it("trims fields and clears blank optional ones", () => {
    expect(
      parseProfileForm(
        form({ username: " Tom.Berry ", displayName: " ", bio: "Hi\r\nthere" }),
      ),
    ).toEqual({
      ok: true,
      value: {
        username: "Tom.Berry",
        displayName: null,
        bio: "Hi\nthere",
        backlogPublic: false,
      },
    });
  });

  it("rejects bad usernames and long fields", () => {
    for (const username of ["ab", "has space", "a".repeat(31), "emoji🙂"]) {
      expect(parseProfileForm(form({ username }))).toMatchObject({
        ok: false,
        errors: { username: expect.any(String) },
      });
    }
    expect(
      parseProfileForm(
        form({
          username: "tom",
          displayName: "a".repeat(profileLimits.displayName + 1),
          bio: "a".repeat(profileLimits.bio + 1),
        }),
      ),
    ).toEqual({
      ok: false,
      errors: {
        displayName: "Keep it to 50 characters or fewer.",
        bio: "Keep it to 500 characters or fewer.",
      },
    });
  });
});
