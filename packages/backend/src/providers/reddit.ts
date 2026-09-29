// Official read-only Reddit OAuth transport. Secrets stay in backend credentials, never source JSON.
import { config, credential, isProduction } from "../config.ts";
import { sha256 } from "../lib/ids.ts";
import { guardedFetch, type GuardedResponse } from "../lib/http-fetch.ts";
import { FetchError } from "../sources/types.ts";
import { SITE } from "@aihot/industry/site";

interface Token { value: string; expiresAt: number }
interface Session { key: string; token: Token | null; pending: Promise<Token> | null; retryAt: number }
let session: Session | null = null;

function required(name: string): string {
  const value = credential("collectors", name);
  if (!value) throw new FetchError(`${name} is not configured`);
  return value;
}

/** Endpoint overrides are only for a loopback stub, with the existing development fetch opt-in. */
function endpoint(name: string, expected: string): string {
  const value = credential("collectors", name) ?? expected;
  let url: URL;
  try { url = new URL(value); }
  catch { throw new FetchError(`${name} is invalid`); }
  if (url.username || url.password || url.search || url.hash) throw new FetchError(`${name} is invalid`);
  if (value === expected) return value;
  if (!isProduction && config.allowPrivateNetworkFetch && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return value.replace(/\/$/, "");
  throw new FetchError(`${name} must use the official Reddit endpoint`);
}

function assertAvailable(state: Session): void {
  const seconds = Math.ceil((state.retryAt - Date.now()) / 1000);
  if (seconds > 0) throw new FetchError(`Reddit HTTP 429: retry after ${seconds}s`, 429, seconds);
}

function seconds(value: string | null): number {
  const n = value?.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function recordLimit(state: Session, response: GuardedResponse): void {
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (response.status !== 429 && (remaining === null || !Number.isFinite(Number(remaining)) || Number(remaining) > 0)) return;
  const retry = response.headers.get("retry-after");
  const date = retry && !Number.isFinite(Number(retry)) ? Date.parse(retry) : NaN;
  const delay = Math.max(seconds(retry), Number.isFinite(date) ? (date - Date.now()) / 1000 : 0, seconds(response.headers.get("x-ratelimit-reset")), 60);
  state.retryAt = Math.max(state.retryAt, Date.now() + delay * 1000);
}

async function request(url: string, options: Parameters<typeof guardedFetch>[1]): Promise<GuardedResponse> {
  try {
    // Do not forward Basic/Bearer credentials to a redirect destination, even on the same host.
    return await guardedFetch(url, { ...options, maxRedirects: 0, route: "egress", timeoutMs: 25_000 });
  } catch {
    throw new FetchError("Reddit request failed (network error or redirect)");
  }
}

export async function fetchReddit(url: string): Promise<GuardedResponse> {
  const target = new URL(url);
  if (target.origin !== "https://oauth.reddit.com" || target.username || target.password) throw new FetchError("Reddit API URL must use https://oauth.reddit.com");
  const clientId = required("REDDIT_CLIENT_ID");
  const secret = required("REDDIT_CLIENT_SECRET");
  const username = credential("collectors", "REDDIT_USERNAME");
  const userAgent = credential("collectors", "REDDIT_USER_AGENT") ?? (username ? `server:${SITE.crawlerName}:v1.0 (by /u/${username})` : required("REDDIT_USER_AGENT"));
  if (/[\r\n]/.test(userAgent)) throw new FetchError("REDDIT_USER_AGENT is invalid");
  const refreshToken = credential("collectors", "REDDIT_REFRESH_TOKEN");
  const tokenUrl = endpoint("REDDIT_TOKEN_URL", "https://www.reddit.com/api/v1/access_token");
  const apiBase = endpoint("REDDIT_API_BASE_URL", "https://oauth.reddit.com");
  const key = sha256(JSON.stringify([clientId, secret, refreshToken, userAgent, tokenUrl, apiBase]));
  if (session?.key !== key) session = { key, token: null, pending: null, retryAt: 0 };
  const state = session;

  async function accessToken(): Promise<Token> {
    assertAvailable(state);
    if (state.token && state.token.expiresAt > Date.now()) return state.token;
    if (state.pending) return state.pending;
    state.pending = (async () => {
      const form = new URLSearchParams(refreshToken ? { grant_type: "refresh_token", refresh_token: refreshToken } : { grant_type: "client_credentials" });
      const response = await request(tokenUrl, {
        method: "POST", body: form.toString(), maxBytes: 64 * 1024,
        headers: { authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded", "user-agent": userAgent, accept: "application/json" },
      });
      recordLimit(state, response);
      if (response.status === 429) assertAvailable(state);
      if (response.status !== 200) throw new FetchError(`Reddit OAuth HTTP ${response.status}: check application credentials and approval`, response.status);
      let data: { access_token?: unknown; token_type?: unknown; expires_in?: unknown };
      try { data = JSON.parse(response.text()); }
      catch { throw new FetchError("Reddit OAuth returned invalid JSON"); }
      if (!data || typeof data.access_token !== "string" || !data.access_token || String(data.token_type).toLowerCase() !== "bearer" || typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
        throw new FetchError("Reddit OAuth returned an invalid token or expiry");
      }
      const token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - Math.min(30, data.expires_in / 2)) * 1000 };
      state.token = token;
      return token;
    })();
    try { return await state.pending; }
    finally { state.pending = null; }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await accessToken();
    assertAvailable(state);
    const response = await request(`${apiBase}${target.pathname}${target.search}`, {
      headers: { authorization: `Bearer ${token.value}`, "user-agent": userAgent, "accept-language": "en", accept: "application/json" },
    });
    recordLimit(state, response);
    if (response.status === 401 && attempt === 0) {
      if (state.token === token) state.token = null;
      continue;
    }
    if (response.status === 429) assertAvailable(state);
    if (response.status !== 200) throw new FetchError(`Reddit API HTTP ${response.status}: check read access and subreddit visibility`, response.status);
    return response;
  }
  throw new FetchError("Reddit authentication failed", 401);
}
