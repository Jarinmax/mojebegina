// GPT/MCP pilot — společné kousky čtecích nástrojů: období z argumentů,
// dohledání obchodníka podle jména a hlavička zdroje dat.
import "server-only";
import { listStaffOptions } from "@/lib/data/leads";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";
import { readDataSource } from "@/lib/data/dataSource";
import type { DataDomain } from "@/lib/data/dataSourceValidation";
import {
  matchSalesperson,
  validatePragueDateRange,
  type CallActivityRange,
  type StaffCandidate,
} from "@/lib/data/callActivityValidation";
import { ArgError, optionalString } from "../args";
import { buildSource, type PageInfo, type Period } from "../envelope";

export const DATE_DESCRIPTION = "RRRR-MM-DD (kalendářní den v Europe/Prague).";

/** Volitelné období z dvojice argumentů; chybí obě = null, chybí jen konec = jeden den. */
export function optionalRange(
  args: Record<string, unknown>,
  fromKey: string,
  toKey: string,
  maxDays: number | null
): CallActivityRange | null {
  const from = optionalString(args, fromKey, 10);
  const to = optionalString(args, toKey, 10);
  if (from === null && to === null) return null;
  if (from === null) throw new ArgError(`K argumentu ${toKey} chybí ${fromKey}.`);
  const range = validatePragueDateRange(from, to, maxDays);
  if (!range.ok) throw new ArgError(`${fromKey}/${toKey}: ${range.error}`);
  return range.value;
}

export function periodOf(range: CallActivityRange | null, note?: string): Period | null {
  return range ? { dateFrom: range.dateFrom, dateTo: range.dateTo, timeZone: "Europe/Prague", ...(note ? { note } : {}) } : null;
}

export type SalespersonResolution =
  | { ok: true; person: StaffCandidate }
  | { ok: false; error: string };

/** Obchodník podle jména/e-mailu mezi interními uživateli; víc shod = nehádá se. */
export async function resolveSalesperson(query: string): Promise<SalespersonResolution> {
  const staff = await listStaffOptions();
  const match = matchSalesperson(query, staff);
  if (match.kind === "one") return { ok: true, person: match.person };
  const names = (match.kind === "many" ? match.candidates : staff).map((c) => c.name ?? c.email);
  const error = match.kind === "many" ? "Zadanému jménu odpovídá víc lidí — upřesněte, koho myslíte." : "Obchodník nebyl nalezen.";
  return { ok: false, error: names.length > 0 ? `${error} Možnosti: ${names.join(", ")}.` : error };
}

/** Hlavička `source` pro výstup nástroje (prostředí, větev, čas, čerstvost domén, úplnost). */
export async function sourceFor(
  domains: DataDomain[],
  options: { period?: Period | null; page?: PageInfo | null; complete?: boolean; warnings?: string[] } = {}
) {
  return buildSource(await readDataSource(domains), options);
}

/** Část výstupu z jedné domény: nedostupná (oprávnění/chyba) se nikdy nevydává za nulu. */
export type Section<T> = { available: true; data: T } | { available: false; reason: string };

export async function section<T>(name: string, fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return { available: true, data: await fn() };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
      return { available: false, reason: "Na tuto část nemá váš účet v MojeBegina oprávnění — data nejsou nulová, jen nedostupná." };
    }
    console.error("MCP: část výstupu selhala", name, error instanceof Error ? error.name : typeof error);
    return { available: false, reason: "Tuto část se nepodařilo načíst (chyba na straně MojeBegina) — data nejsou nulová, jen nedostupná." };
  }
}

