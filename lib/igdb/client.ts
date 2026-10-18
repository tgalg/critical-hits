const tokenUrl = "https://id.twitch.tv/oauth2/token";
const apiUrl = "https://api.igdb.com/v4";

export type IgdbCredentials = { clientId: string; clientSecret: string };

type ClientOptions = {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  // IGDB allows 4 requests per second.
  minIntervalMs?: number;
};

export type IgdbClient = {
  query<T>(endpoint: string, body: string): Promise<T[]>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createIgdbClient(
  credentials: IgdbCredentials,
  {
    fetch = globalThis.fetch,
    now = Date.now,
    minIntervalMs = 250,
  }: ClientOptions = {},
): IgdbClient {
  let token: { value: string; expiresAt: number } | undefined;
  let nextSlot = 0;

  async function accessToken() {
    if (token && token.expiresAt > now()) return token.value;
    const params = new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "client_credentials",
    });
    const response = await fetch(`${tokenUrl}?${params}`, { method: "POST" });
    if (!response.ok) {
      throw new Error(`Twitch token request failed: ${response.status}`);
    }
    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    // Refresh a minute early so a request never carries an expiring token.
    token = {
      value: body.access_token,
      expiresAt: now() + (body.expires_in - 60) * 1000,
    };
    return token.value;
  }

  async function throttle() {
    const wait = nextSlot - now();
    nextSlot = Math.max(now(), nextSlot) + minIntervalMs;
    if (wait > 0) await sleep(wait);
  }

  async function send(endpoint: string, body: string) {
    await throttle();
    return fetch(`${apiUrl}/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": credentials.clientId,
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "text/plain",
      },
      body,
    });
  }

  return {
    async query<T>(endpoint: string, body: string) {
      let response = await send(endpoint, body);
      if (response.status === 401) {
        // The token was revoked early; fetch a new one and retry once.
        token = undefined;
        response = await send(endpoint, body);
      }
      if (!response.ok) {
        throw new Error(`IGDB ${endpoint} request failed: ${response.status}`);
      }
      return (await response.json()) as T[];
    },
  };
}
