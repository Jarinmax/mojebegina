// Security Phase 19 (Denní volání 1.0) — čistá validace + čistá logika
// výběru, bez "server-only", stejný princip jako leadValidation.ts:
// testovatelné bez databáze, kontrola a dotaz se skládají až v
// dailyCalls.ts.
import { validateStageInput, type LeadStage } from "./leadValidation";

// Výsledek hovoru je ZÁMĚRNĚ oddělený od LEAD_STAGES (obchodní fáze) —
// schváleno explicitně: "výsledek hovoru není obchodní fáze". Fáze zůstává
// samostatné, nepovinné pole s výchozí hodnotou "neměnit".
export const CALL_RESULTS = [
  "reached_interested",
  "reached_not_interested",
  "no_answer",
  "call_back_later",
  "invalid_contact",
] as const;
export type CallResult = (typeof CALL_RESULTS)[number];

export type DailyCallOutcomeInput = {
  result: string;
  note: string;
  stageChange: string;
  nextFollowUpAt: string;
};

export type ValidatedDailyCallOutcomeInput = {
  result: CallResult;
  note: string;
  stageChange: LeadStage | null;
  nextFollowUpAt: Date | null;
};

// Výsledek a poznámka POVINNÉ, fáze a datum nepovinné — s jednou vázanou
// výjimkou: "zavolat později" bez termínu dalšího kontaktu by byl
// nedohledatelný slib, proto je u něj datum vynucené (schváleno explicitně).
export function validateDailyCallOutcomeInput(
  input: DailyCallOutcomeInput
): { ok: true; value: ValidatedDailyCallOutcomeInput } | { ok: false; error: string } {
  const result = input.result.trim();
  if (!CALL_RESULTS.includes(result as CallResult)) {
    return { ok: false, error: "Vyberte výsledek hovoru." };
  }

  const note = input.note.trim();
  if (!note) {
    return { ok: false, error: "Poznámka je povinná." };
  }
  if (note.length > 2000) {
    return { ok: false, error: "Poznámka je příliš dlouhá (max. 2000 znaků)." };
  }

  const stageChangeRaw = input.stageChange.trim();
  let stageChange: LeadStage | null = null;
  if (stageChangeRaw) {
    const validatedStage = validateStageInput(stageChangeRaw);
    if (!validatedStage.ok) {
      return validatedStage;
    }
    stageChange = validatedStage.value;
  }

  const nextFollowUpAtRaw = input.nextFollowUpAt.trim();
  let nextFollowUpAt: Date | null = null;
  if (nextFollowUpAtRaw) {
    // Stejná konvence jako leadValidation.ts/orderValidation.ts — datum bez
    // času, uloženo na 12:00 UTC (V1 záměrně beze změny, viz schválený
    // návrh — nový časový mechanismus se teď nezavádí).
    const parsed = new Date(`${nextFollowUpAtRaw}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "Neplatné datum dalšího kontaktu." };
    }
    nextFollowUpAt = parsed;
  }

  if ((result as CallResult) === "call_back_later" && !nextFollowUpAt) {
    return { ok: false, error: "U výsledku „Zavolat později“ je datum dalšího kontaktu povinné." };
  }

  return { ok: true, value: { result: result as CallResult, note, stageChange, nextFollowUpAt } };
}

// Maximální počet SOUČASNĚ nevyřízených položek fronty (staré nedokončené
// + drafty + zveřejněné dohromady) — schváleno explicitně.
export const MAX_QUEUE_SIZE = 10;

export type CandidateLeadRow = { id: string; createdAt: Date };

// Deterministické řazení kandidátů pro automatický návrh — od nejstaršího
// createdAt, stabilní tiebreak na id (stejný princip jako
// compareLeadsForList/compareFocusProjectsForList).
function compareCandidates(a: CandidateLeadRow, b: CandidateLeadRow): number {
  const diff = a.createdAt.getTime() - b.createdAt.getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Čistá funkce: kolik a kterých kandidátů doplnit, aby součet se
// SOUČASNÝM počtem nevyřízených položek nepřekročil MAX_QUEUE_SIZE.
// `candidates` už musí být filtrovaní na DB úrovni (owner=Blahout, aktivní
// stav, telefon, lastContactedAt IS NULL, ještě ne ve frontě) — tahle
// funkce jen deterministicky seřadí a ořízne.
export function candidatesToAdd(currentPendingCount: number, candidates: CandidateLeadRow[]): CandidateLeadRow[] {
  const remaining = Math.max(0, MAX_QUEUE_SIZE - currentPendingCount);
  if (remaining === 0) {
    return [];
  }
  return [...candidates].sort(compareCandidates).slice(0, remaining);
}

// Europe/Prague datum jako "YYYY-MM-DD" (bez závislosti na timezone
// knihovně — Intl.DateTimeFormat s en-CA locale dává přímo ISO tvar,
// DST-aware). Používá se pro `added_for_date` a pro hranici "dnes" v
// progress ukazateli a rozdělení "Nedokončeno z minula"/"Dnešní volání".
export function pragueDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(date);
}

// Čistá interpretace výsledku atomického CTE zápisu (dailyCalls.ts:
// logDailyCallOutcome). Skutečnou bezpečnost proti dvojímu/souběžnému
// zápisu zaručuje samotné SQL (WHERE status='pending' ... EXISTS(claimed),
// viz komentář tam) — 0 vrácených řádků znamená, že položka v mezičase
// přestala být `pending` (dvojklik, souběžný request, nebo už vyřízeno
// jinde). Tahle funkce jen převádí ten výsledek na odpověď pro uživatele —
// vytčeno zvlášť, aby šlo otestovat bez databáze.
export function interpretCallLogOutcome(insertedRowCount: number): { ok: true } | { ok: false; error: string } {
  if (insertedRowCount === 0) {
    return { ok: false, error: "Tento kontakt už byl mezitím vyřízen (souběžný nebo opakovaný zápis)." };
  }
  return { ok: true };
}

// Prohození sousední dvojice v poli id — čistá logika za "posunout
// nahoru/dolů" (dailyCalls.ts: moveQueueItemUp/Down). `null` = krok není
// možný (položka je už na kraji). Vytčeno zvlášť, aby šlo otestovat bez
// databáze — skutečné bezpečné zapsání nového pořadí (dvoufázové
// přečíslování) dělá až applyQueueReorder v dailyCalls.ts.
export function swapAdjacent<T>(ids: readonly T[], index: number, direction: "up" | "down"): T[] | null {
  if (index < 0 || index >= ids.length) {
    return null;
  }
  const otherIndex = direction === "up" ? index - 1 : index + 1;
  if (otherIndex < 0 || otherIndex >= ids.length) {
    return null;
  }
  const result = [...ids];
  [result[index], result[otherIndex]] = [result[otherIndex], result[index]];
  return result;
}
