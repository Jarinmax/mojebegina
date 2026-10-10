import "server-only";

// Doména aktuálního požadavku pro serverové komponenty a akce e-shopu
// (hlavičku nastavuje proxy.ts; bez ní = interní, jako dosud).
import { headers } from "next/headers";
import { SITE_HEADER, siteFromHeader } from "@/lib/site/hosts";
import { baseForSite, type EshopBase } from "./paths";

export async function currentSite(): Promise<"public" | "internal"> {
  return siteFromHeader((await headers()).get(SITE_HEADER));
}

export async function eshopBase(): Promise<EshopBase> {
  return baseForSite(await currentSite());
}
