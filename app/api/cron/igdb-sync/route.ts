import { timingSafeEqual } from "node:crypto";
import { runNightlySync } from "@/lib/catalog/sync";
import { getDatabase } from "@/lib/db";
import { igdbSourceFromEnv } from "@/lib/igdb/source";

export const maxDuration = 300;
// Leave a minute of headroom for the last page before Vercel stops the run.
const budgetMs = 240_000;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Nightly sync: recent IGDB changes, then more of the initial backfill. Running
// it by hand from the Vercel dashboard fills a new catalog faster.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runNightlySync(getDatabase(), igdbSourceFromEnv(), {
    deadline: Date.now() + budgetMs,
  });
  if (!result.updated.done) {
    console.warn("IGDB sync hit its time budget", result);
  }
  return Response.json(result);
}
