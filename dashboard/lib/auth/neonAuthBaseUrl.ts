// Security Phase 2.6b — NEON_AUTH_BASE_URL byl dosud jediná ručně
// udržovaná proměnná ve Vercelu, a Neon–Vercel integrace ji (na rozdíl od
// DATABASE_URL/PGHOST) per Preview branch automaticky nenastavuje — nová
// Preview branch tak dědila cizí (produkční) auth endpoint a přihlášení se
// zaseklo na "Přihlašuji…" (ověřeno na fix/mobile-overflow-dashboard).
//
// PGHOST už ale integrace pro KAŽDOU branch (Production i libovolný
// Preview) spolehlivě nastavuje správně. Neon Auth URL je z něj mechanicky
// odvoditelná — ověřeno přímo v Neon Console (branch main, Connect →
// Auth tab):
//   PGHOST:   ep-<id>-pooler.<cluster>.<region>.aws.neon.tech
//   Auth URL: https://ep-<id>.neonauth.<cluster>.<region>.aws.neon.tech/<db>/auth
// tj. stejné compute-endpoint ID (bez "-pooler"), "neonauth" místo přímého
// pokračování hostname, a cesta "/<database>/auth" na konci.
export function deriveNeonAuthBaseUrl(
  pgHost: string | undefined,
  database: string | undefined
): string | null {
  if (!pgHost || !database) {
    return null;
  }

  const labels = pgHost.trim().split(".");
  // Potřebujeme aspoň "ep-..." a jednu další úroveň hostname (region/apod.) —
  // cokoliv kratšího/podezřelého bereme jako neplatné a necháme volajícího
  // spadnout na fallback.
  if (labels.length < 2 || !labels[0]) {
    return null;
  }

  const endpointId = labels[0].replace(/-pooler$/, "");
  if (!endpointId) {
    return null;
  }

  const rest = labels.slice(1).join(".");
  if (!rest) {
    return null;
  }

  return `https://${endpointId}.neonauth.${rest}/${database}/auth`;
}
