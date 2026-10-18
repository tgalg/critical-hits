import { timingSafeEqual } from "node:crypto";
import { syncCatalog } from "@/lib/catalog/sync";
import { getDatabase } from "@/lib/db";
import { igdbSourceFromEnv } from "@/lib/igdb/source";

// Long enough for several IGDB pages at 4 requests per second.
export const maxDuration = 300;

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
  const result = await syncCatalog(getDatabase(), igdbSourceFromEnv(), {
    updatedSince: new Date(Date.now() - 2 * day),
    maxPages: 20,
  });
  return Response.json(result);
}
