import { describe, expect, it } from "vitest";
import { createIgdbClient } from "@/lib/igdb/client";
import { gamesQuery, mapIgdbGame, type IgdbGame } from "@/lib/igdb/source";
import fixture from "@/lib/igdb/__fixtures__/games.json";

const games = fixture as IgdbGame[];

describe("mapIgdbGame", () => {
  it("maps an IGDB game to a catalog row", () => {
    expect(mapIgdbGame(games[0])).toEqual({
      igdbId: 1942,
      slug: "the-witcher-3-wild-hunt",
      title: "The Witcher 3: Wild Hunt",
      coverUrl:
        "https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg",
      releaseDate: "2015-05-19",
      summary: "RPG and sequel to The Witcher 2.",
      platforms: [
        { igdbId: 6, name: "PC (Microsoft Windows)", abbreviation: "PC" },
        { igdbId: 48, name: "PlayStation 4", abbreviation: "PS4" },
      ],
    });
  });

  it("fills missing optional fields with null", () => {
    const game = mapIgdbGame({ id: 1, name: "Bare", slug: "bare" });
    expect(game).toMatchObject({
      coverUrl: null,
      releaseDate: null,
      summary: null,
      platforms: [],
    });
    expect(mapIgdbGame(games[1]).platforms[1].abbreviation).toBeNull();
  });
});

describe("gamesQuery", () => {
  it("pages by id and filters by type, cover and update time", () => {
    expect(
      gamesQuery({
        after: 10,
        limit: 500,
        updatedSince: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toBe(
      "fields name,slug,summary,first_release_date,cover.image_id,platforms.name,platforms.abbreviation; " +
        "where id > 10 & game_type = (0,8,9) & cover != null & updated_at >= 1767225600; sort id asc; limit 500;",
    );
  });
});

describe("createIgdbClient", () => {
  function fakeTwitch() {
    let clock = 0;
    const calls: string[] = [];
    const fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push(String(url).split("?")[0]);
      if (String(url).startsWith("https://id.twitch.tv")) {
        return Response.json({
          access_token: `token${calls.length}`,
          expires_in: 3600,
        });
      }
      const auth = new Headers(init?.headers).get("authorization");
      return Response.json([{ auth }]);
    }) as typeof globalThis.fetch;
    const client = createIgdbClient(
      { clientId: "id", clientSecret: "secret" },
      { fetch, now: () => clock, minIntervalMs: 0 },
    );
    return { client, calls, advance: (ms: number) => (clock += ms) };
  }

  it("reuses the access token until it is about to expire", async () => {
    const { client, calls, advance } = fakeTwitch();
    const [first] = await client.query<{ auth: string }>(
      "games",
      "fields name;",
    );
    const [second] = await client.query<{ auth: string }>(
      "games",
      "fields name;",
    );
    expect(first.auth).toBe("Bearer token1");
    expect(second.auth).toBe("Bearer token1");
    expect(calls.filter((url) => url.includes("twitch"))).toHaveLength(1);

    advance(3600 * 1000);
    const [third] = await client.query<{ auth: string }>(
      "games",
      "fields name;",
    );
    expect(third.auth).not.toBe("Bearer token1");
    expect(calls.filter((url) => url.includes("twitch"))).toHaveLength(2);
  });
});
