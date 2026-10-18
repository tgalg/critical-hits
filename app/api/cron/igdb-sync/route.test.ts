import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/igdb-sync/route";

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/igdb-sync", {
    headers: authorization ? { authorization } : {},
  });

describe("IGDB sync cron route", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rejects requests without the cron secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
  });

  it("rejects every request when no secret is configured", async () => {
    expect((await GET(request("Bearer "))).status).toBe(401);
    expect((await GET(request("Bearer undefined"))).status).toBe(401);
  });
});
