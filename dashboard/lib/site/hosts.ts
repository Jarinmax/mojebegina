// Domény jedné aplikace (varianta A, rozhodnutí vedení 10. 10. 2026):
//   begina.cz       = veřejný web a e-shop (stránky z app/eshop bez prefixu),
//   www.begina.cz   = jen přesměrování 301 na begina.cz,
//   gpt-pilot.begina.cz = GPT/MCP pilot: veřejně jen discovery, /api/mcp,
//                     OAuth a nezbytné přihlášení, vše ostatní 404
//                     (lib/site/routing.ts, routeAgent),
//   cokoli jiného   = interní systém MojeBegina (moje.begina.cz, Preview
//                     *.vercel.app, localhost) — chová se jako dosud.
//
// Čisté funkce bez Next.js — používá je proxy.ts, serverové komponenty
// i testy. Žádná proměnná prostředí doménu nepřepíná: begina.cz se stane
// veřejným webem až tím, že na aplikaci začne mířit DNS.

export const PUBLIC_HOST = "begina.cz";
export const WWW_HOST = "www.begina.cz";
export const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`;
/**
 * Pilotní doména asistenta ChatGPT (Preview větve pilotu, výjimka
 * z Deployment Protection). Pozná se JEN přesná shoda — podobné názvy ani
 * poddomény ne. Omezení se odvozuje od hostitele, ne od proměnných
 * prostředí: platí i kdyby doména omylem mířila jinam (třeba na Production).
 */
export const AGENT_HOST = "gpt-pilot.begina.cz";

export type Site = "public" | "www" | "agent" | "internal";

/** Hlavička, kterou proxy.ts předává stránkám (vždy ji přepíše — nelze podvrhnout). */
export const SITE_HEADER = "x-begina-site";

/** "Begina.CZ:443" / "begina.cz." → "begina.cz"; prázdné → "". */
export function normalizeHost(raw: string | null | undefined): string {
  let host = (raw ?? "").trim().toLowerCase();
  // IPv6 literál [::1]:3000 → bez portu
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(0, end + 1);
  }
  const colon = host.indexOf(":");
  if (colon !== -1) host = host.slice(0, colon);
  while (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}

export function siteForHost(raw: string | null | undefined): Site {
  const host = normalizeHost(raw);
  if (host === PUBLIC_HOST) return "public";
  if (host === WWW_HOST) return "www";
  if (host === AGENT_HOST) return "agent";
  return "internal";
}

/**
 * Přišel požadavek přes pilotní doménu? Kontroluje Host i každou hodnotu
 * X-Forwarded-Host — kterákoli z nich = ano. Podvržená hlavička tak může
 * omezení jen přidat, nikdy obejít.
 */
export function isAgentRequest(host: string | null | undefined, forwardedHost: string | null | undefined): boolean {
  if (siteForHost(host) === "agent") return true;
  return (forwardedHost ?? "").split(",").some((value) => siteForHost(value) === "agent");
}

/** Hodnota SITE_HEADER → Site; cokoli neznámého = interní (bezpečný výchozí stav). */
export function siteFromHeader(value: string | null | undefined): "public" | "internal" {
  return value === "public" ? "public" : "internal";
}
