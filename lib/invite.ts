import { createHash, timingSafeEqual } from "node:crypto";

// While SIGNUP_INVITE_CODE is set, new accounts (email or Discord) need it.
// The sign-up page trades a correct code for a short-lived cookie, and
// Better Auth checks that cookie just before it creates a user (lib/auth.ts).
export const inviteCookie = "ch_invite";
export const inviteRejection = "invite_required";

export function requiredInviteCode(value = process.env.SIGNUP_INVITE_CODE) {
  const code = value?.trim().toLowerCase();
  return code || null;
}

export function inviteToken(code: string) {
  return createHash("sha256")
    .update(`critical-hits-invite:${code.trim().toLowerCase()}`)
    .digest("hex");
}

const sameToken = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function inviteMatches(given: string, code: string) {
  return sameToken(inviteToken(given), inviteToken(code));
}

function readCookie(header: string | null | undefined, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

// Whether a request with this Cookie header may create an account.
export function hasInvite(
  cookieHeader: string | null | undefined,
  code = requiredInviteCode(),
) {
  if (!code) return true;
  const token = readCookie(cookieHeader, inviteCookie);
  return token !== null && sameToken(token, inviteToken(code));
}
