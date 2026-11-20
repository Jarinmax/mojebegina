// IndexNow (20. 11. 2026, Lucie): změny stránek a produktů hned ohlásit Bingu
// (a dalším vyhledávačům, které IndexNow sdílí). Klíč je veřejný — leží na
// https://begina.cz/{INDEXNOW_KEY}.txt (app/eshop/<klíč>.txt/route.ts).
// Odesílá cron /api/cron/indexnow: produkty změněné za poslední den a po novém
// nasazení webu všechny adresy ze sitemapy.
import { PUBLIC_ORIGIN } from "./hosts";

export const INDEXNOW_KEY = "8f3c2a9e1d7b4c6a0e5f2b9d3c7a1e48";
export const INDEXNOW_KEY_URL = `${PUBLIC_ORIGIN}/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** IndexNow přijme v jednom požadavku nejvýš 10 000 adres. */
const MAX_URLS = 10_000;

export function indexNowPayload(urls: readonly string[]) {
  const host = new URL(PUBLIC_ORIGIN).host;
  const urlList = [...new Set(urls)].filter((url) => {
    try {
      return new URL(url).host === host;
    } catch {
      return false;
    }
  });
  return { host, key: INDEXNOW_KEY, keyLocation: INDEXNOW_KEY_URL, urlList: urlList.slice(0, MAX_URLS) };
}

export async function submitIndexNow(urls: readonly string[], fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status: number | null; count: number }> {
  const payload = indexNowPayload(urls);
  if (payload.urlList.length === 0) return { ok: true, status: null, count: 0 };
  try {
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    // 200 = přijato, 202 = přijato, klíč se ověřuje
    return { ok: response.status === 200 || response.status === 202, status: response.status, count: payload.urlList.length };
  } catch {
    return { ok: false, status: null, count: payload.urlList.length };
  }
}

/** Nasazení je „nové“, když vzniklo za posledních `windowHours` hodin (čas buildu, next.config.ts). */
export function deployedRecently(buildTime: string | undefined, now: Date, windowHours = 24): boolean {
  const built = buildTime ? Date.parse(buildTime) : NaN;
  return Number.isFinite(built) && now.getTime() - built >= 0 && now.getTime() - built < windowHours * 3_600_000;
}
