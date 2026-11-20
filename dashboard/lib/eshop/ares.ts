// ARES (Administrativní registr ekonomických subjektů, Ministerstvo financí) —
// načtení názvu a sídla firmy podle IČO pro ochutnávku do provozu (20. 11. 2026).
// Veřejné REST API bez přihlášení:
//   GET https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}
// Čistá funkce s předaným fetch (testy bez sítě). Když ARES neodpoví, objednávka
// nepadá — zákazník údaje vyplní v pokladně ručně (IČO se i tak kontroluje).

export const ARES_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";

export type AresCompany = { ico: string; name: string; dic: string | null; street: string; city: string; zip: string };
export type AresResult = { ok: true; company: AresCompany } | { ok: false; reason: "not_found" | "unavailable" };

type AresSidlo = {
  nazevUlice?: string;
  nazevCastiObce?: string;
  nazevObce?: string;
  cisloDomovni?: number | string;
  cisloOrientacni?: number | string;
  cisloOrientacniPismeno?: string;
  psc?: number | string;
  textovaAdresa?: string;
};

/** Ulice a číslo jako na faktuře: „Mostecká 273/21“, bez ulice „Vitice 119“. */
export function aresStreet(sidlo: AresSidlo): string {
  const house = sidlo.cisloDomovni !== undefined ? String(sidlo.cisloDomovni) : "";
  const orientation = sidlo.cisloOrientacni !== undefined ? `${sidlo.cisloOrientacni}${sidlo.cisloOrientacniPismeno ?? ""}` : "";
  const number = [house, orientation].filter(Boolean).join("/");
  const place = sidlo.nazevUlice ?? sidlo.nazevCastiObce ?? sidlo.nazevObce ?? "";
  return [place, number].filter(Boolean).join(" ").trim();
}

export function aresZip(psc: number | string | undefined): string {
  const digits = String(psc ?? "").replace(/\D/g, "");
  return digits.length === 5 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : "";
}

export function parseAresCompany(data: unknown, ico: string): AresCompany | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as { obchodniJmeno?: unknown; dic?: unknown; sidlo?: AresSidlo };
  if (typeof record.obchodniJmeno !== "string" || !record.obchodniJmeno.trim()) return null;
  const sidlo = record.sidlo ?? {};
  return {
    ico,
    name: record.obchodniJmeno.trim(),
    dic: typeof record.dic === "string" && record.dic.trim() ? record.dic.trim() : null,
    street: aresStreet(sidlo),
    city: (sidlo.nazevObce ?? "").trim(),
    zip: aresZip(sidlo.psc),
  };
}

export async function lookupAres(ico: string, fetchImpl: typeof fetch = fetch, timeoutMs = 5000): Promise<AresResult> {
  try {
    const response = await fetchImpl(`${ARES_URL}/${encodeURIComponent(ico)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (response.status === 404 || response.status === 400) return { ok: false, reason: "not_found" };
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const company = parseAresCompany(await response.json(), ico);
    return company ? { ok: true, company } : { ok: false, reason: "not_found" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
