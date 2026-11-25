// SEO – skutečné pozice v Googlu ze Search Console (25. 11. 2026, Lucie).
// Servisní účet begina-seo-reader@begina-seo.iam.gserviceaccount.com má v Search Console
// pro https://begina.cz/ oprávnění „Omezené“ (jen čtení). Klíč (JSON) je ve Vercelu
// v proměnné GSC_SERVICE_ACCOUNT_JSON. Bez knihoven: JWT RS256 přes node:crypto.
import { createSign } from "node:crypto";

export const GSC_SITE_URL = "https://begina.cz/";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export type ServiceAccount = { client_email: string; private_key: string };

export type GscRow = { day: string; query: string; page: string; clicks: number; impressions: number; position: number };

/** Klíč z proměnné prostředí; přijme čistý JSON i JSON v base64. null = chybí nebo je vadný. */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw || !raw.trim()) return null;
  const candidates = [raw.trim()];
  try {
    candidates.push(Buffer.from(raw.trim(), "base64").toString("utf8"));
  } catch {
    // není base64
  }
  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as Partial<ServiceAccount>;
      if (typeof parsed.client_email === "string" && typeof parsed.private_key === "string" && parsed.private_key.includes("PRIVATE KEY")) {
        return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
      }
    } catch {
      // zkusí další variantu
    }
  }
  return null;
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Podepsaný JWT pro výměnu za přístupový token (platí 1 hodinu). */
export function buildJwt(account: ServiceAccount, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(account.private_key))}`;
}

async function accessToken(account: ServiceAccount): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: buildJwt(account, Math.floor(Date.now() / 1000)) }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(`GSC token: ${response.status} ${body.error ?? ""} ${body.error_description ?? ""}`.trim());
  return body.access_token;
}

/** Dotazy × stránky × dny za dané období (Search Console má zpoždění 2–3 dny). */
export async function fetchSearchAnalytics(account: ServiceAccount, startDate: string, endDate: string): Promise<GscRow[]> {
  const token = await accessToken(account);
  const rows: GscRow[] = [];
  const pageSize = 25_000;
  for (let startRow = 0; startRow < 100_000; startRow += pageSize) {
    const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: ["date", "query", "page"], rowLimit: pageSize, startRow, dataState: "all" }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await response.json().catch(() => ({}))) as { rows?: { keys: string[]; clicks: number; impressions: number; position: number }[]; error?: { message?: string } };
    if (!response.ok) throw new Error(`GSC query: ${response.status} ${body.error?.message ?? ""}`.trim());
    const batch = body.rows ?? [];
    for (const row of batch) {
      const [day, query, page] = row.keys;
      rows.push({ day, query, page, clicks: Math.round(row.clicks), impressions: Math.round(row.impressions), position: Math.round(row.position * 10) / 10 });
    }
    if (batch.length < pageSize) break;
  }
  return rows;
}

/** Souhrn dotazů za období: kliknutí, zobrazení a vážená průměrná pozice. */
export function summarizeQueries(rows: { query: string; clicks: number; impressions: number; position: number }[]) {
  const map = new Map<string, { query: string; clicks: number; impressions: number; positionWeight: number }>();
  for (const row of rows) {
    const item = map.get(row.query) ?? { query: row.query, clicks: 0, impressions: 0, positionWeight: 0 };
    item.clicks += row.clicks;
    item.impressions += row.impressions;
    item.positionWeight += row.position * row.impressions;
    map.set(row.query, item);
  }
  return [...map.values()]
    .map((item) => ({ query: item.query, clicks: item.clicks, impressions: item.impressions, position: item.impressions > 0 ? Math.round((item.positionWeight / item.impressions) * 10) / 10 : null }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}
