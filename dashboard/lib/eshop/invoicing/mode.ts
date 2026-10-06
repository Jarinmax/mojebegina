// ESHOP 1.0 — režim fakturace a brána ostrého vystavení do iDokladu.
//
//   „dry_run“  návrh faktury se sestaví a uloží, do iDokladu se nic
//              neodesílá. Vždy mimo Vercel Production (Preview, lokální
//              vývoj, testy) a v Production, dokud není vše níže splněné.
//   „live“     ostré vystavení (issue.ts). Brána je otevřená JEN když
//              platí VŠECHNO zároveň:
//                • VERCEL_ENV = production (systémová proměnná Vercelu —
//                  na Preview ji nelze nastavit, takže tam zápis nikdy
//                  neprojde),
//                • IDOKLAD_INVOICING_ENABLED = on (výslovné zapnutí vedením),
//                • IDOKLAD_ESHOP_SEQUENCE_ID = 7277293 (řada „E-shop Begina“;
//                  jiné ID bránu zavře),
//                • IDOKLAD_ESHOP_CLIENT_ID + IDOKLAD_ESHOP_CLIENT_SECRET
//                  (Client Credentials agendy Begina).
// Zápisová pojistka v idokladHttp.ts navíc pustí zápis jen klientovi
// vytvořenému z otevřené brány.

import { parseSeriesId, type SeriesConfig } from "./numberSeries";

type Env = Record<string, string | undefined>;

/** Jediná řada, do které smí e-shop vystavovat (ověřeno read-only 7. 10. 2026). */
export const ESHOP_SERIES = { id: "7277293", name: "E-shop Begina" } as const;

/** Agenda Begina: IČO, neplátce DPH. Do jiné agendy se nezapisuje. */
export const BEGINA_ICO = "74337297";

export type InvoicingMode = { mode: "dry_run" | "live"; reason: string };

export type LiveGate =
  | { open: true; clientId: string; clientSecret: string; seriesId: string }
  | { open: false; reason: string };

/** Ostré vystavování je v kódu hotové; zapíná se jen bránou níže. */
export const LIVE_INVOICING_IMPLEMENTED = true;

export function liveInvoicingGate(env: Env = process.env): LiveGate {
  if (env.VERCEL_ENV !== "production") {
    return { open: false, reason: "Testovací provoz (Preview): do iDokladu se nikdy nic neodesílá." };
  }
  if (env.IDOKLAD_INVOICING_ENABLED !== "on") {
    return { open: false, reason: "Ostré vystavování v iDokladu není zapnuté — vzniká jen návrh." };
  }
  const series = parseSeriesId(env.IDOKLAD_ESHOP_SEQUENCE_ID);
  if (series.id !== ESHOP_SERIES.id) {
    return {
      open: false,
      reason: `Ostré vystavování je zablokované: IDOKLAD_ESHOP_SEQUENCE_ID musí být ${ESHOP_SERIES.id} (${ESHOP_SERIES.name}).`,
    };
  }
  const clientId = env.IDOKLAD_ESHOP_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.IDOKLAD_ESHOP_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    return { open: false, reason: "Ostré vystavování je zablokované: chybí přístupové údaje k iDokladu." };
  }
  return { open: true, clientId, clientSecret, seriesId: series.id };
}

export function invoicingMode(env: Env = process.env): InvoicingMode {
  const gate = liveInvoicingGate(env);
  if (gate.open) return { mode: "live", reason: "Ostrý provoz: faktura se vystaví v iDokladu v řadě E-shop Begina." };
  return { mode: "dry_run", reason: gate.reason };
}

/** ID e-shopové číselné řady v iDokladu; null = zatím nepotvrzené nebo neplatné. */
export function invoiceNumberSeriesId(env: Env = process.env): string | null {
  return parseSeriesId(env.IDOKLAD_ESHOP_SEQUENCE_ID).id;
}

/** ID řady + případný problém s nastavením (pro návrh faktury). */
export function invoiceNumberSeries(env: Env = process.env): SeriesConfig {
  return parseSeriesId(env.IDOKLAD_ESHOP_SEQUENCE_ID);
}
