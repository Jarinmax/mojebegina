// ESHOP 1.0 — režim fakturace a brána ostrého vystavení do iDokladu.
//
// Přepínač IDOKLAD_INVOICING_ENABLED má TŘI jednoznačné stavy:
//   chybí / „off“  jen návrh faktury, do iDokladu nic (žádný zápis),
//   „manual“       žádné automatické vystavení; fakturu lze vystavit JEN
//                  výslovnou akcí oprávněného uživatele v detailu konkrétní
//                  zaplacené objednávky,
//   „on“           automatické vystavení po zaplacení (budoucí ostrý režim).
// Jiná hodnota (překlep, „yes“, „ON“…) = jako „off“ — nikdy nic neotevře.
//
// „manual“ i „on“ používají TENTÝŽ vystavovací motor (issue.ts) se stejnými
// kontrolami (preflight.ts) a idempotencí — liší se jen tím, kdo ho spustí.
//
// Ostrý zápis je možný, jen když platí VŠECHNO zároveň:
//   • VERCEL_ENV = production (systémová proměnná Vercelu — na Preview ji
//     nelze nastavit, takže tam zápis nikdy neprojde, ani s „manual“/„on“),
//   • přepínač „manual“ nebo „on“,
//   • IDOKLAD_ESHOP_SEQUENCE_ID = 7277293 (řada „E-shop Begina“),
//   • IDOKLAD_ESHOP_CLIENT_ID + IDOKLAD_ESHOP_CLIENT_SECRET (Client
//     Credentials agendy Begina — API klíče z iDokladu, Nastavení →
//     Aplikace) + IDOKLAD_ESHOP_APPLICATION_ID (ApplicationId aplikace
//     „MojeBegina Eshop“ z Developer portálu; oficiální SDK 5.4.0 ho
//     u Client Credentials vyžaduje jako application_id).
// Zápisová pojistka v idokladHttp.ts navíc ověří bránu znovu před KAŽDÝM
// zápisem, a vystavení před každým pokusem projde kontrolou iDokladu
// (preflight.ts) — selhání kterékoli kontroly = faktura se nevystaví.

import { parseSeriesId, type SeriesConfig } from "./numberSeries";

type Env = Record<string, string | undefined>;

/** Jediná řada, do které smí e-shop vystavovat (ověřeno read-only 7. 10. 2026). */
export const ESHOP_SERIES = { id: "7277293", name: "E-shop Begina" } as const;

/** Agenda Begina: IČO, neplátce DPH. Do jiné agendy se nezapisuje. */
export const BEGINA_ICO = "74337297";

export type InvoicingSwitch = "off" | "manual" | "on";

export type InvoicingMode = {
  mode: "dry_run" | "live";
  /** „manual“ / „on“ — jen v ostrém režimu, jinak „off“ */
  trigger: InvoicingSwitch;
  /** true jen ve stavu „on“ (vystavení hned po zaplacení) */
  automatic: boolean;
  reason: string;
};

export type LiveGate =
  | { open: true; trigger: "manual" | "on"; clientId: string; clientSecret: string; applicationId: string; seriesId: string }
  | { open: false; reason: string };

/** Ostré vystavování je v kódu hotové; zapíná se jen bránou níže. */
export const LIVE_INVOICING_IMPLEMENTED = true;

/** Hodnota přepínače; neznámá hodnota = „off“ (s důvodem). */
export function invoicingSwitch(env: Env = process.env): { value: InvoicingSwitch; invalid: string | null } {
  const raw = env.IDOKLAD_INVOICING_ENABLED?.trim() ?? "";
  if (raw === "" || raw === "off") return { value: "off", invalid: null };
  if (raw === "manual" || raw === "on") return { value: raw, invalid: null };
  return { value: "off", invalid: raw.slice(0, 20) };
}

export type EshopIdokladCredentials = { clientId: string; clientSecret: string; applicationId: string };

/** Názvy proměnných přihlášení Client Credentials (oficiální SDK: ClientId + ClientSecret + ApplicationId). */
export const IDOKLAD_CREDENTIAL_VARS = [
  "IDOKLAD_ESHOP_CLIENT_ID",
  "IDOKLAD_ESHOP_CLIENT_SECRET",
  "IDOKLAD_ESHOP_APPLICATION_ID",
] as const;

/** Které z proměnných přihlášení chybí (jen názvy, nikdy hodnoty). */
export function missingIdokladCredentials(env: Env = process.env): string[] {
  return IDOKLAD_CREDENTIAL_VARS.filter((name) => !(env[name]?.trim() ?? ""));
}

/** Přístupové údaje Client Credentials (stejné pro preflight i vystavení); null = některý chybí. */
export function eshopIdokladCredentials(env: Env = process.env): EshopIdokladCredentials | null {
  if (missingIdokladCredentials(env).length > 0) return null;
  return {
    clientId: env.IDOKLAD_ESHOP_CLIENT_ID!.trim(),
    clientSecret: env.IDOKLAD_ESHOP_CLIENT_SECRET!.trim(),
    applicationId: env.IDOKLAD_ESHOP_APPLICATION_ID!.trim(),
  };
}

export function liveInvoicingGate(env: Env = process.env): LiveGate {
  if (env.VERCEL_ENV !== "production") {
    return { open: false, reason: "Testovací provoz (Preview): do iDokladu se nikdy nic neodesílá." };
  }
  const sw = invoicingSwitch(env);
  if (sw.invalid !== null) {
    return {
      open: false,
      reason: `Ostré vystavování je vypnuté: IDOKLAD_INVOICING_ENABLED „${sw.invalid}“ není platná hodnota (off / manual / on).`,
    };
  }
  if (sw.value === "off") {
    return { open: false, reason: "Ostré vystavování v iDokladu není zapnuté — vzniká jen návrh." };
  }
  const series = parseSeriesId(env.IDOKLAD_ESHOP_SEQUENCE_ID);
  if (series.id !== ESHOP_SERIES.id) {
    return {
      open: false,
      reason: `Ostré vystavování je zablokované: IDOKLAD_ESHOP_SEQUENCE_ID musí být ${ESHOP_SERIES.id} (${ESHOP_SERIES.name}).`,
    };
  }
  const credentials = eshopIdokladCredentials(env);
  if (!credentials) {
    return {
      open: false,
      reason: `Ostré vystavování je zablokované: chybí přístupové údaje k iDokladu (${missingIdokladCredentials(env).join(", ")}).`,
    };
  }
  return { open: true, trigger: sw.value, ...credentials, seriesId: series.id };
}

/**
 * Vlastní fakturace v MojeBegina místo iDokladu (rozhodnutí Lucie 23. 11. 2026, ownIssue.ts).
 * Výchozí = vlastní; INVOICING_PROVIDER=idoklad vrátí starou cestu (nouzově a testy iDokladu).
 */
export function ownInvoicingActive(env: Env = process.env): boolean {
  return env.INVOICING_PROVIDER?.trim() !== "idoklad";
}

export type OwnGate = { open: true; trigger: "manual" | "on" } | { open: false; reason: string };

/** Brána vlastní fakturace: Production + přepínač „manual“/„on“ (iDoklad se už nevolá). */
export function ownInvoicingGate(env: Env = process.env): OwnGate {
  if (!ownInvoicingActive(env)) return { open: false, reason: "Vlastní fakturace je vypnutá (INVOICING_PROVIDER=idoklad)." };
  if (env.VERCEL_ENV !== "production") return { open: false, reason: "Testovací provoz (Preview): faktury se vystavují jen v ostré verzi." };
  const sw = invoicingSwitch(env);
  if (sw.invalid !== null) return { open: false, reason: `Vystavování je vypnuté: IDOKLAD_INVOICING_ENABLED „${sw.invalid}“ není platná hodnota (off / manual / on).` };
  if (sw.value === "off") return { open: false, reason: "Vystavování faktur není zapnuté — vzniká jen návrh." };
  return { open: true, trigger: sw.value };
}

export function invoicingMode(env: Env = process.env): InvoicingMode {
  if (ownInvoicingActive(env)) {
    const own = ownInvoicingGate(env);
    if (!own.open) return { mode: "dry_run", trigger: "off", automatic: false, reason: own.reason };
    return own.trigger === "manual"
      ? { mode: "live", trigger: "manual", automatic: false, reason: "Ostrý provoz — ruční režim: faktura (řada 2026xxxx) se vystaví jen tlačítkem u zaplacené objednávky." }
      : { mode: "live", trigger: "on", automatic: true, reason: "Ostrý provoz: faktura se vystaví v MojeBegina (řada 2026xxxx) hned po zaplacení." };
  }
  const gate = liveInvoicingGate(env);
  if (!gate.open) return { mode: "dry_run", trigger: "off", automatic: false, reason: gate.reason };
  if (gate.trigger === "manual") {
    return {
      mode: "live",
      trigger: "manual",
      automatic: false,
      reason: "Ostrý provoz — ruční režim: faktura se vystaví v iDokladu jen tlačítkem u zaplacené objednávky.",
    };
  }
  return {
    mode: "live",
    trigger: "on",
    automatic: true,
    reason: "Ostrý provoz: faktura se vystaví v iDokladu v řadě E-shop Begina hned po zaplacení.",
  };
}

/** ID e-shopové číselné řady v iDokladu; null = zatím nepotvrzené nebo neplatné. */
export function invoiceNumberSeriesId(env: Env = process.env): string | null {
  return parseSeriesId(env.IDOKLAD_ESHOP_SEQUENCE_ID).id;
}

/** ID řady + případný problém s nastavením (pro návrh faktury). */
export function invoiceNumberSeries(env: Env = process.env): SeriesConfig {
  return parseSeriesId(env.IDOKLAD_ESHOP_SEQUENCE_ID);
}
