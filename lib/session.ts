import "server-only";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

// The signed-in user for this request, or null. Headers are read before
// getAuth() so the calling page is dynamic and never connects to the database
// while being prerendered at build time.
export async function getCurrentUser() {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
}
