"use server";

// Převod leadu na zákazníka — předvyplnění firmy z ARES (Jarin 22. 11. 2026):
// obchodník napíše IČO nebo název a formulář doplní oficiální název a sídlo.
// Jen čtení veřejného registru, nic nezapisuje. Volat smí jen ten, kdo smí
// zakládat organizace (ADMIN) — stejné omezení jako formulář.
import { getAuthContext } from "@/lib/data/authContext";
import { aresAddressLine, lookupAres, searchAresByName, type AresCompany } from "@/lib/eshop/ares";

export type AresPrefill = { ico: string; name: string; dic: string | null; address: string; city: string };

export type AresLookupResponse =
  | { ok: true; company: AresPrefill }
  | { ok: false; reason: "not_found" | "unavailable" | "forbidden" | "invalid" };

export type AresSearchResponse =
  | { ok: true; companies: AresPrefill[] }
  | { ok: false; reason: "unavailable" | "forbidden" };

function toPrefill(company: AresCompany): AresPrefill {
  return { ico: company.ico, name: company.name, dic: company.dic, address: aresAddressLine(company), city: company.city };
}

async function allowed(): Promise<boolean> {
  const ctx = await getAuthContext();
  return ctx?.systemRole === "ADMIN";
}

export async function aresLookupByIcoAction(rawIco: string): Promise<AresLookupResponse> {
  if (!(await allowed())) return { ok: false, reason: "forbidden" };
  const ico = String(rawIco ?? "").replace(/\s/g, "");
  if (!/^\d{8}$/.test(ico)) return { ok: false, reason: "invalid" };
  const result = await lookupAres(ico);
  return result.ok ? { ok: true, company: toPrefill(result.company) } : { ok: false, reason: result.reason };
}

export async function aresSearchByNameAction(rawName: string): Promise<AresSearchResponse> {
  if (!(await allowed())) return { ok: false, reason: "forbidden" };
  const name = String(rawName ?? "").trim().slice(0, 120);
  const result = await searchAresByName(name);
  return result.ok ? { ok: true, companies: result.companies.map(toPrefill) } : { ok: false, reason: "unavailable" };
}
