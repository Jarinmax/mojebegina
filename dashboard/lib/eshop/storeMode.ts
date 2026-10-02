// ESHOP 1.0 — v jakém režimu e-shop běží (pro pruh nahoře na stránce).
//   "test"     mimo Production: testovací provoz (testovací platby, e-maily
//              jen na testovací adresy) — pruh „Náhled e-shopu“,
//   "readonly" Production před spuštěním (ESHOP_ORDER_WRITE není on):
//              objednávky se nikam neodesílají — pruh „Náhled e-shopu“,
//   "live"     Production po spuštění: ostrý obchod, žádný pruh.
import { isOrderWriteEnabled } from "./orderWrite";

type Env = Record<string, string | undefined>;

export type StoreMode = "test" | "readonly" | "live";

export function storeMode(env: Env = process.env): StoreMode {
  if (env.VERCEL_ENV !== "production") return "test";
  return isOrderWriteEnabled(env) ? "live" : "readonly";
}
