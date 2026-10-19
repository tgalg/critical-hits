export const profileLimits = { displayName: 50, bio: 500 };

// Same rules as Better Auth's username plugin (lib/auth.ts).
export const usernamePattern = /^[a-zA-Z0-9_.]{3,30}$/;

export const usernameRules =
  "Use 3 to 30 letters, numbers, underscores or dots.";

// Handles generated at Discord sign-up before players were asked to pick one
// ended in an underscore and eight hex digits.
export const looksGenerated = (username: string) =>
  /_[0-9a-f]{8}$/i.test(username);

export type ProfileInput = {
  username: string;
  displayName: string | null;
  bio: string | null;
  backlogPublic: boolean;
};

export type ProfileErrors = Partial<
  Record<"username" | "displayName" | "bio", string>
>;

export type ParsedProfile =
  { ok: true; value: ProfileInput } | { ok: false; errors: ProfileErrors };

type FormLike = { get(name: string): FormDataEntryValue | null };

// Browsers submit line breaks as CRLF; store them as plain newlines.
const text = (form: FormLike, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().replace(/\r\n?/g, "\n") : "";
};

export function parseProfileForm(form: FormLike): ParsedProfile {
  const errors: ProfileErrors = {};
  const username = text(form, "username");
  if (!usernamePattern.test(username)) {
    errors.username = usernameRules;
  }
  const displayName = text(form, "displayName");
  if (displayName.length > profileLimits.displayName) {
    errors.displayName = `Keep it to ${profileLimits.displayName} characters or fewer.`;
  }
  const bio = text(form, "bio");
  if (bio.length > profileLimits.bio) {
    errors.bio = `Keep it to ${profileLimits.bio} characters or fewer.`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      username,
      displayName: displayName || null,
      bio: bio || null,
      // An unticked checkbox isn't submitted at all.
      backlogPublic: form.get("backlogPublic") === "on",
    },
  };
}
