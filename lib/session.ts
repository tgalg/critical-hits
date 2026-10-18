import "server-only";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

// The signed-in user for this request, or null. Reading headers also keeps
// the calling page dynamic, so it never renders at build time.
export async function getCurrentUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
