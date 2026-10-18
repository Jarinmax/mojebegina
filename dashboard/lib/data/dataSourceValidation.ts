// GPT/MCP pilot — odkud data asistent právě čte. Čistá logika bez
// "server-only" (testy v lib/agent/__tests__/envelope.test.ts); dotazy na
// databázi skládá dataSource.ts.
//
// Dvě různé věci, které se NESMÍ plést:
//   1. Prostředí a stáří KOPIE — odvozené ze skutečné Neon větve (Preview
//      kopie Production vs. Production) a známého data, kdy kopie vznikla.
//      Jen z toho plyne varování „Preview KOPIE“.
//   2. Poslední zaznamenaná aktivita v doméně (lastRecordedActivityAt) —
//      jen informace. Starší aktivita sama o sobě NEZNAMENÁ zastaralou
//      databázi (obchodník mohl prostě nic nezapsat).
import { PILOT_PREVIEW_DB, PRODUCTION_DB } from "@/lib/diagnostics/dbTarget";
import { formatPragueDateTime } from "./callActivityValidation";

export type DataDomain = "crm" | "daily_calls" | "orders" | "customers" | "company" | "focus";

export const DATA_DOMAINS: Record<DataDomain, { label: string }> = {
  crm: { label: "CRM (leady a jejich historie)" },
  daily_calls: { label: "Denní fronta volání" },
  orders: { label: "Objednávky a platby" },
  customers: { label: "Zákazníci" },
  company: { label: "Živá mapa firmy" },
  focus: { label: "CEO projekty" },
};

export type DataEnvironment = "Production" | "Preview" | "neznámé";

/**
 * Známé kopie Production. Preview větev pilotu vznikla z Production při
 * prvním nasazení pilotní větve (13. 10. 2026 večer, UTC) — přibližné
 * datum; přesné „Created“ je v Neon konzoli u větve. Po obnovení větve
 * z Production („Reset from parent“) je potřeba datum zde aktualizovat.
 */
export const KNOWN_COPIES: Record<string, { copiedFromProductionAt: string; approximate: boolean }> = {
  [PILOT_PREVIEW_DB.branchId]: { copiedFromProductionAt: "2026-10-13T22:27:00.000Z", approximate: true },
};

export function environmentFromBranch(branchId: string | null): DataEnvironment {
  if (branchId === PRODUCTION_DB.branchId) return "Production";
  if (branchId === PILOT_PREVIEW_DB.branchId) return "Preview";
  return "neznámé";
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));

export type DomainActivity = {
  domain: DataDomain;
  label: string;
  lastRecordedActivityAt: string | null;
  lastRecordedActivityAtPrague: string | null;
  daysSinceLastRecordedActivity: number | null;
};

export function domainActivity(domain: DataDomain, latest: Date | null, now: Date): DomainActivity {
  return {
    domain,
    label: DATA_DOMAINS[domain].label,
    lastRecordedActivityAt: latest ? latest.toISOString() : null,
    lastRecordedActivityAtPrague: latest ? formatPragueDateTime(latest) : null,
    daysSinceLastRecordedActivity: latest ? daysBetween(latest, now) : null,
  };
}

export type CopyInfo = {
  copiedFromProductionAt: string;
  copiedFromProductionAtPrague: string;
  copyAgeDays: number;
  approximate: boolean;
} | null;

export function copyInfo(branchId: string | null, now: Date): CopyInfo {
  const known = branchId ? KNOWN_COPIES[branchId] : undefined;
  if (!known) return null;
  const at = new Date(known.copiedFromProductionAt);
  return {
    copiedFromProductionAt: known.copiedFromProductionAt,
    copiedFromProductionAtPrague: formatPragueDateTime(at),
    copyAgeDays: daysBetween(at, now),
    approximate: known.approximate,
  };
}

/** Varování o PROSTŘEDÍ a stáří kopie — ne o tom, kdy kdo naposledy něco zapsal. */
export function sourceWarnings(environment: DataEnvironment, copy: CopyInfo): string[] {
  if (environment === "Production") return [];
  if (environment === "Preview") {
    return [
      copy
        ? `Zdroj je Preview KOPIE Production ${copy.approximate ? "přibližně " : ""}ze ${copy.copiedFromProductionAtPrague} (stáří kopie ${copy.copyAgeDays} dní) — co se v Production změnilo potom, v ní není.`
        : "Zdroj je Preview KOPIE Production neznámého stáří — údaje nemusí odpovídat aktuálnímu stavu.",
    ];
  }
  return ["Nepodařilo se ověřit, ze které databáze data pocházejí (Preview/Production) — berte je s rezervou."];
}

export type SourceInfo = {
  deployment: string;
  environment: DataEnvironment;
  neonBranchId: string | null;
  copy: CopyInfo;
  queriedAt: string;
  queriedAtPrague: string;
  activity: DomainActivity[];
};
