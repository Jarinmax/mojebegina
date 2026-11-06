// GPT/MCP pilot — společná hlavička čtecích výstupů a stránkování.
//
// Každý čtecí nástroj vrací `source`: prostředí dat (Preview/Production)
// a nasazení, Neon větev, stáří kopie, čas dotazu, období, poslední
// zaznamenanou aktivitu čtených domén (jen informace), úplnost výsledku
// (complete/truncated/nextCursor) a varování. Asistent tak vždy rozliší
// skutečnou nulu od zastaralé kopie, oříznutého výpisu nebo chybějících dat.
// Čisté funkce (testy v __tests__/envelope.test.ts).
import { createHash } from "node:crypto";
import { sourceWarnings, type SourceInfo } from "@/lib/data/dataSourceValidation";
import { ArgError } from "./args";

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

export type Paging = { limit: number; offset: number; filterKey: string };

/** Otisk filtrů — kurzor z jiného dotazu se nesmí použít (vrátil by nesouvisející stránku). */
export function filterKey(filters: unknown): string {
  return createHash("sha256").update(JSON.stringify(filters)).digest("base64url").slice(0, 12);
}

export function parsePaging(args: Record<string, unknown>, filters: unknown): Paging {
  const key = filterKey(filters);
  const rawLimit = args.limit;
  let limit = DEFAULT_PAGE_SIZE;
  if (rawLimit !== undefined && rawLimit !== null) {
    if (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1) {
      throw new ArgError(`Argument limit musí být celé číslo 1–${MAX_PAGE_SIZE}.`);
    }
    limit = Math.min(rawLimit, MAX_PAGE_SIZE);
  }

  const rawCursor = args.cursor;
  let offset = 0;
  if (rawCursor !== undefined && rawCursor !== null && rawCursor !== "") {
    if (typeof rawCursor !== "string" || rawCursor.length > 100) throw new ArgError("Neplatný cursor.");
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
    } catch {
      throw new ArgError("Neplatný cursor.");
    }
    const value = decoded as { o?: unknown; k?: unknown };
    if (typeof value?.o !== "number" || !Number.isInteger(value.o) || value.o < 0 || value.k !== key) {
      throw new ArgError("Cursor patří k jinému dotazu nebo jiným filtrům — začněte znovu bez cursoru.");
    }
    offset = value.o;
  }
  return { limit, offset, filterKey: key };
}

export type PageInfo = {
  totalMatching: number;
  offset: number;
  returned: number;
  complete: boolean;
  truncated: boolean;
  nextCursor: string | null;
};

export function pageInfo(totalMatching: number, paging: Paging, returned: number): PageInfo {
  const end = paging.offset + returned;
  const more = end < totalMatching;
  return {
    totalMatching,
    offset: paging.offset,
    returned,
    complete: paging.offset === 0 && !more,
    truncated: more,
    nextCursor: more ? Buffer.from(JSON.stringify({ o: end, k: paging.filterKey })).toString("base64url") : null,
  };
}

export type Period = { dateFrom: string | null; dateTo: string | null; timeZone: "Europe/Prague"; note?: string };

/** Hlavička `source` výstupu. Bez stránkování = výstup je úplný, pokud není řečeno jinak. */
export function buildSource(
  info: SourceInfo,
  options: { period?: Period | null; page?: PageInfo | null; complete?: boolean; warnings?: string[] } = {}
) {
  const page = options.page ?? null;
  return {
    environment: info.environment,
    deployment: info.deployment,
    neonBranchId: info.neonBranchId,
    copy: info.copy,
    queriedAt: info.queriedAt,
    queriedAtPrague: info.queriedAtPrague,
    period: options.period ?? null,
    lastRecordedActivity: info.activity,
    complete: page ? page.complete : (options.complete ?? true),
    truncated: page ? page.truncated : !(options.complete ?? true),
    nextCursor: page?.nextCursor ?? null,
    warnings: [...sourceWarnings(info.environment, info.copy), ...(options.warnings ?? [])],
  };
}

export const PAGING_PROPERTIES = {
  limit: { type: "integer", minimum: 1, maximum: MAX_PAGE_SIZE, description: `Počet záznamů na stránku (výchozí ${DEFAULT_PAGE_SIZE}, max. ${MAX_PAGE_SIZE}).` },
  cursor: { type: "string", description: "source.nextCursor z předchozí stránky STEJNÉHO dotazu (se stejnými filtry)." },
} as const;

/** Text do seznamů zkrácený (detail má plné znění). */
export function excerpt(text: string | null, max = 300): string | null {
  if (text === null) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
