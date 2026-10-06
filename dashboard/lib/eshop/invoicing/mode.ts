// ESHOP 1.0 — režim fakturace. Dnes VŽDY „dry_run“: návrh faktury se
// sestaví a uloží, do iDokladu se nic neodesílá (tento modul ani nemá
// žádný síťový klient). Ostré vystavení přijde jako samostatný krok:
// implementace live provideru (lib/eshop/invoicing/idokladLive.ts),
// pojistka zápisu podle vzoru finance requestGuard a samostatné schválení
// vedení. Přepnutí pak nemění architekturu — jen tuto funkci.

import { parseSeriesId, type SeriesConfig } from "./numberSeries";

type Env = Record<string, string | undefined>;

export type InvoicingMode = { mode: "dry_run"; reason: string };

/** Ostré vystavování v tomto kódu NENÍ — ani s proměnnými prostředí. */
export const LIVE_INVOICING_IMPLEMENTED = false;

export function invoicingMode(env: Env = process.env): InvoicingMode {
  if (env.VERCEL_ENV !== "production") {
    return { mode: "dry_run", reason: "Testovací provoz (Preview): do iDokladu se nikdy nic neodesílá." };
  }
  if (env.IDOKLAD_INVOICING_ENABLED === "on") {
    return { mode: "dry_run", reason: "Ostré vystavování v iDokladu zatím není naprogramované — vzniká jen návrh." };
  }
  return { mode: "dry_run", reason: "Ostré vystavování v iDokladu není zapnuté — vzniká jen návrh." };
}

/** ID e-shopové číselné řady v iDokladu; null = zatím nepotvrzené nebo neplatné. */
export function invoiceNumberSeriesId(env: Env = process.env): string | null {
  return parseSeriesId(env.IDOKLAD_ESHOP_SEQUENCE_ID).id;
}

/** ID řady + případný problém s nastavením (pro návrh faktury). */
export function invoiceNumberSeries(env: Env = process.env): SeriesConfig {
  return parseSeriesId(env.IDOKLAD_ESHOP_SEQUENCE_ID);
}
