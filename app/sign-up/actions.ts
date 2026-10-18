"use server";

import { cookies } from "next/headers";
import {
  inviteCookie,
  inviteMatches,
  inviteToken,
  requiredInviteCode,
} from "@/lib/invite";

// Checks the invite code and, when it's right, remembers it for the sign-up
// that follows (email or Discord).
export async function rememberInvite(given: string) {
  const code = requiredInviteCode();
  if (!code) return true;
  if (typeof given !== "string" || !inviteMatches(given, code)) return false;
  (await cookies()).set(inviteCookie, inviteToken(code), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
  return true;
}
