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

// --- Převod leadu na zákazníka (Jarin 22. 11. 2026) ---------------------------
// Obchodník napíše IČO nebo název firmy a formulář se předvyplní z ARES.
// Vyhledání podle názvu: POST {ARES_URL}/vyhledat { obchodniJmeno, pocet, start }.

/** Adresa sídla na jeden řádek: „Mostecká 273/21, 118 00 Praha“. */
export function aresAddressLine(company: Pick<AresCompany, "street" | "city" | "zip">): string {
  const cityPart = [company.zip, company.city].filter(Boolean).join(" ");
  if (!company.street) return cityPart;
  // Bez ulice je v street název obce („Vitice 119“) — obec neopakuj.
  if (company.city && company.street.startsWith(company.city)) {
    return [company.street, company.zip].filter(Boolean).join(", ");
  }
  return [company.street, cityPart].filter(Boolean).join(", ");
}

export function parseAresSearch(data: unknown): AresCompany[] {
  if (typeof data !== "object" || data === null) return [];
  const list = (data as { ekonomickeSubjekty?: unknown }).ekonomickeSubjekty;
  if (!Array.isArray(list)) return [];
  const companies: AresCompany[] = [];
  for (const item of list) {
    const ico = typeof item === "object" && item !== null ? (item as { ico?: unknown }).ico : null;
    if (typeof ico !== "string" || !/^\d{8}$/.test(ico)) continue;
    const company = parseAresCompany(item, ico);
    if (company) companies.push(company);
  }
  return companies;
}

export type AresSearchResult = { ok: true; companies: AresCompany[] } | { ok: false; reason: "unavailable" };

export async function searchAresByName(
  name: string,
  fetchImpl: typeof fetch = fetch,
  limit = 6,
  timeoutMs = 5000
): Promise<AresSearchResult> {
  const query = name.trim();
  if (query.length < 3) return { ok: true, companies: [] };
  try {
    const response = await fetchImpl(`${ARES_URL}/vyhledat`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ obchodniJmeno: query, pocet: limit, start: 0 }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    // ARES vrací 400 i pro „příliš mnoho výsledků“ / nic nenalezeno — není to výpadek.
    if (response.status === 400 || response.status === 404) return { ok: true, companies: [] };
    if (!response.ok) return { ok: false, reason: "unavailable" };
    return { ok: true, companies: parseAresSearch(await response.json()).slice(0, limit) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
