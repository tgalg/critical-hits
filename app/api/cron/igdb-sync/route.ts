import { timingSafeEqual } from "node:crypto";
import { syncCatalog } from "@/lib/catalog/sync";
import { getDatabase } from "@/lib/db";
import { igdbSourceFromEnv } from "@/lib/igdb/source";

export const maxDuration = 300;
// Leave a minute of headroom for the last page before Vercel stops the run.
const budgetMs = 240_000;

const day = 24 * 60 * 60 * 1000;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Nightly incremental sync: games IGDB changed in the last two days, so one
// missed run is covered by the next.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  // No page cap: the run continues until IGDB has nothing newer or the time
  // budget runs out, so a busy window is not truncated to its lowest ids.
  const result = await syncCatalog(getDatabase(), igdbSourceFromEnv(), {
    updatedSince: new Date(Date.now() - 2 * day),
    deadline: Date.now() + budgetMs,
  });
  if (!result.done) {
    console.warn("IGDB sync hit its time budget", result);
  }
  return Response.json(result);
}
