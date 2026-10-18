import "server-only";
import { getSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/moderation/admin";

// The signed-in user for this request, or null. Headers are read before
// getAuth() so the calling page is dynamic and never connects to the database
// while being prerendered at build time. Visitors without a session cookie
// are answered without touching auth or the database at all.
export async function getCurrentUser() {
  const requestHeaders = await headers();
  if (!getSessionCookie(requestHeaders)) return null;
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
}

// For server actions: the signed-in user's id, or a redirect to sign in.
export async function requireUserId() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user.id;
}

// The signed-in user if they are a moderator, else null.
export async function getCurrentAdmin() {
  const user = await getCurrentUser();
  return user && isAdmin(user) ? user : null;
}
