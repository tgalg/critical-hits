// Moderators are named by email in ADMIN_EMAILS (comma-separated). Only a
// verified email counts, because email sign-ups are not verified and anyone
// could otherwise register a moderator's address before they do.
export function adminEmails(value = process.env.ADMIN_EMAILS) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdmin(
  user: { email: string; emailVerified: boolean },
  emails = adminEmails(),
) {
  return user.emailVerified && emails.has(user.email.toLowerCase());
}
