// ESHOP 1.0 — je e-shop veřejně vidět, a v jakém režimu běží.
//
// Viditelnost: v Production je /eshop SKRYTÝ (404), dopokud se ve Vercelu
// výslovně nenastaví ESHOP_PUBLIC=on (den spuštění). Preview a lokální
// vývoj jsou vždy dostupné pro testování.
//
// Režim (pro pruh nahoře na stránce):
//   "test"     mimo Production: testovací provoz (testovací platby, e-maily
//              jen na testovací adresy) — pruh „Náhled e-shopu“,
//   "readonly" Production před spuštěním (ESHOP_ORDER_WRITE není on):
//              objednávky se nikam neodesílají — pruh „Náhled e-shopu“,
//   "live"     Production po spuštění: ostrý obchod, žádný pruh.
import { isOrderWriteEnabled } from "./orderWrite";

type Env = Record<string, string | undefined>;

export type StoreMode = "test" | "readonly" | "live";

export function isEshopPublic(env: Env = process.env): boolean {
  return env.VERCEL_ENV !== "production" || env.ESHOP_PUBLIC === "on";
}

export function storeMode(env: Env = process.env): StoreMode {
  if (env.VERCEL_ENV !== "production") return "test";
  return isOrderWriteEnabled(env) ? "live" : "readonly";
}
