// GPT/MCP pilot — aktivita obchodníka v hovorech (nástroj
// get_salesperson_call_activity). Čistá logika bez "server-only", stejný
// princip jako dailyCallsValidation.ts: testovatelné bez databáze, dotazy se
// skládají až v callActivity.ts.
//
// Co je "hovor": VÝHRADNĚ uložený záznam lead_activity s kind "call_logged".
// Vzniká dvěma cestami — rychlý zápis na detailu leadu (leads.ts:
// logCallOutcome; metadata bez callResult) a Denní volání
// (dailyCallsValidation.ts: buildLogDailyCallOutcomeQuery; metadata
// s callResult). Obě ukládají metadata.from = fáze leadu PŘED hovorem.
//
// Rozlišení kontaktu (jen podle uložené historie, nic se nedomýšlí; systém
// zná jen ZAZNAMENANÉ hovory, nezapsaný telefonát znát nemůže):
//   - "first_recorded"          — první zaznamenaný hovor u leadu vůbec
//                                  (kdokoli, kdykoli), bez ohledu na fázi.
//   - "first_recorded_imported" — totéž, ale lead vznikl importem z tabulky,
//                                  jehož starší historie v systému není →
//                                  "první evidovaný hovor v MojeBegina",
//                                  ne jistý první skutečný kontakt.
//   - "repeat"                  — lead už má dřívější zaznamenaný hovor.
import { STAGE_LABELS } from "@/app/rizeni-firmy/obchod/leadLabels";
import { CALL_RESULT_LABELS } from "@/app/rizeni-firmy/obchod/dnes/dailyCallLabels";
import { leadDisplayName, type LeadStage } from "./leadValidation";
import type { CallResult } from "./dailyCallsValidation";

export const CALL_ACTIVITY_TIME_ZONE = "Europe/Prague";
/** Nejdelší dotazované období (dní včetně). */
export const MAX_CALL_ACTIVITY_DAYS = 31;
/** Nejvýš tolik hovorů se vrací s detailem; počty jsou vždy úplné. */
export const MAX_CALL_DETAILS = 250;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// --- Datum a hranice dne v Europe/Prague ----------------------------------

function parseIsoDate(value: string): number | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const utc = Date.UTC(y, m - 1, d);
  // 2026-02-30 apod. Date.UTC tiše přetočí — odmítnout
  return new Date(utc).toISOString().slice(0, 10) === value ? utc : null;
}

function addDays(value: string, days: number): string {
  return new Date(parseIsoDate(value)! + days * DAY_MS).toISOString().slice(0, 10);
}

const PRAGUE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: CALL_ACTIVITY_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function pragueParts(instant: Date) {
  const parts = Object.fromEntries(PRAGUE_PARTS.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Posun Europe/Prague proti UTC v daném okamžiku (ms; +1 h v zimě, +2 h v létě). */
function pragueOffsetMs(instant: Date): number {
  const p = pragueParts(instant);
  const wholeSeconds = Math.floor(instant.getTime() / 1000) * 1000;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - wholeSeconds;
}

/**
 * Okamžik, kdy v Praze začíná daný kalendářní den (00:00 místního času).
 * Půlnoc v Praze nikdy nepadne do přechodu letního času (ten je ve 2:00/3:00),
 * takže druhý průchod vždy dá přesný výsledek i ve dnech přechodu.
 */
export function pragueDayStart(date: string): Date {
  const midnightAsUtc = parseIsoDate(date);
  if (midnightAsUtc === null) throw new Error(`Neplatné datum: ${date}`);
  let instant = midnightAsUtc - pragueOffsetMs(new Date(midnightAsUtc));
  instant = midnightAsUtc - pragueOffsetMs(new Date(instant));
  return new Date(instant);
}

/** "RRRR-MM-DD HH:MM" v Europe/Prague. */
export function formatPragueDateTime(instant: Date): string {
  const p = pragueParts(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** "RRRR-MM-DD" v Europe/Prague. */
export function formatPragueDate(instant: Date): string {
  return formatPragueDateTime(instant).slice(0, 10);
}

export type CallActivityRange = {
  dateFrom: string;
  dateTo: string;
  /** včetně */
  start: Date;
  /** bez — začátek dne po dateTo */
  end: Date;
};

/**
 * Období RRRR-MM-DD až RRRR-MM-DD včetně (kalendářní dny v Praze); dateTo
 * chybí = jen jeden den. maxDays null = bez omezení délky (jen souhrnná čísla).
 */
export function validatePragueDateRange(
  dateFrom: string,
  dateTo: string | null,
  maxDays: number | null
): { ok: true; value: CallActivityRange } | { ok: false; error: string } {
  const to = dateTo ?? dateFrom;
  const fromUtc = parseIsoDate(dateFrom);
  const toUtc = parseIsoDate(to);
  if (fromUtc === null || toUtc === null) {
    return { ok: false, error: "Datum musí být ve tvaru RRRR-MM-DD (např. 2026-10-14)." };
  }
  if (toUtc < fromUtc) {
    return { ok: false, error: "Konec období je před jeho začátkem." };
  }
  if (maxDays !== null && (toUtc - fromUtc) / DAY_MS + 1 > maxDays) {
    return { ok: false, error: `Období může mít nejvýš ${maxDays} dní — rozdělte dotaz na kratší úseky.` };
  }
  return {
    ok: true,
    value: { dateFrom, dateTo: to, start: pragueDayStart(dateFrom), end: pragueDayStart(addDays(to, 1)) },
  };
}

/** Období jednotlivých hovorů (nejvýš MAX_CALL_ACTIVITY_DAYS dní). */
export function validateCallActivityRange(
  dateFrom: string,
  dateTo: string | null
): { ok: true; value: CallActivityRange } | { ok: false; error: string } {
  return validatePragueDateRange(dateFrom, dateTo, MAX_CALL_ACTIVITY_DAYS);
}

/** Dnešní datum v Praze (RRRR-MM-DD). */
export function pragueToday(now: Date): string {
  return formatPragueDate(now);
}

/** Posun data RRRR-MM-DD o počet dní. */
export function shiftDate(date: string, days: number): string {
  return addDays(date, days);
}

// --- Výběr obchodníka podle jména/e-mailu ----------------------------------

export type StaffCandidate = { userId: string; name: string | null; email: string };

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Najde obchodníka mezi interními uživateli. Přesná shoda jména nebo
 * e-mailu má přednost; jinak musí všechna zadaná slova odpovídat celým
 * slovům jména ("Blahout", "jaroslav blahout"). Bez diakritiky a velikosti
 * písmen. Víc kandidátů = nic se nehádá, vrátí se seznam k upřesnění.
 */
export function matchSalesperson(
  query: string,
  staff: readonly StaffCandidate[]
): { kind: "one"; person: StaffCandidate } | { kind: "many"; candidates: StaffCandidate[] } | { kind: "none" } {
  const q = normalizeName(query);
  if (!q) return { kind: "none" };

  const exact = staff.filter((s) => s.email.toLowerCase() === q || (s.name !== null && normalizeName(s.name) === q));
  const tokens = q.split(" ");
  const matches =
    exact.length > 0
      ? exact
      : staff.filter((s) => {
          if (s.name === null) return false;
          const nameTokens = normalizeName(s.name).split(" ");
          return tokens.every((t) => nameTokens.includes(t));
        });

  if (matches.length === 1) return { kind: "one", person: matches[0] };
  if (matches.length > 1) return { kind: "many", candidates: matches };
  return { kind: "none" };
}

// --- Souhrn hovorů --------------------------------------------------------

export type CallActivityRow = {
  id: string;
  leadId: string;
  createdAt: Date;
  body: string | null;
  metadata: unknown;
  lead: {
    companyName: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    stage: string;
  };
  /** lead vznikl importem z tabulky (starší historie mimo systém) */
  imported: boolean;
};

export type EarliestCallRow = { id: string; leadId: string; createdAt: Date };

export type ContactType = "first_recorded" | "first_recorded_imported" | "repeat";

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  first_recorded: "první zaznamenaný hovor u leadu (první kontakt)",
  first_recorded_imported:
    "první evidovaný hovor v MojeBegina — importovaný lead, dřívější kontakt mimo systém nelze vyloučit",
  repeat: "opakovaný zaznamenaný hovor",
};

export type CallWarning = "missing_result" | "missing_note" | "missing_next_contact";

export const CALL_WARNING_LABELS: Record<CallWarning, string> = {
  missing_result: "chybí výsledek hovoru",
  missing_note: "chybí poznámka",
  missing_next_contact: "chybí termín dalšího kontaktu",
};

// Výsledky, po kterých další kontakt nedává smysl — u nich chybějící termín
// není nedostatek zápisu.
const TERMINAL_RESULTS: readonly string[] = ["reached_not_interested", "invalid_contact"];
const TERMINAL_STAGES: readonly string[] = ["not_interested", "converted"];

/** Nejstarší call_logged každého leadu (shoda času → menší id, stejně jako řazení výpisu). */
export function earliestCallByLead(rows: readonly EarliestCallRow[]): Map<string, EarliestCallRow> {
  const earliest = new Map<string, EarliestCallRow>();
  for (const row of rows) {
    const current = earliest.get(row.leadId);
    const earlier =
      !current ||
      row.createdAt.getTime() < current.createdAt.getTime() ||
      (row.createdAt.getTime() === current.createdAt.getTime() && row.id < current.id);
    if (earlier) earliest.set(row.leadId, row);
  }
  return earliest;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function stageLabel(stage: string | null): string | null {
  return stage === null ? null : (STAGE_LABELS[stage as LeadStage] ?? stage);
}

export type CallDetail = {
  activityId: string;
  at: string;
  atPrague: string;
  contactType: ContactType;
  result: string | null;
  resultLabel: string | null;
  stageBefore: string | null;
  stageChangedTo: string | null;
  stageChangedToLabel: string | null;
  note: string | null;
  nextContactDate: string | null;
  warnings: CallWarning[];
};

export type LeadCallSummary = {
  leadId: string;
  name: string;
  currentStage: string;
  currentStageLabel: string;
  contactType: ContactType;
  callsInPeriod: number;
  firstCallAtPrague: string;
  lastCallAtPrague: string;
  lastResultLabel: string | null;
  nextContactDate: string | null;
  incompleteCalls: number;
  calls: CallDetail[];
};

export type CallActivitySummary = {
  totals: {
    recordedCalls: number;
    uniqueLeads: number;
    firstContactLeads: number;
    firstContactImportedLeads: number;
    repeatOnlyLeads: number;
    repeatCalls: number;
    incompleteCalls: number;
  };
  leads: LeadCallSummary[];
  incompleteRecords: Array<{ leadId: string; name: string; atPrague: string; warnings: string[] }>;
  detailsTruncated: boolean;
};

function describeCall(row: CallActivityRow, earliest: Map<string, EarliestCallRow>): CallDetail {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const result = str(meta.callResult);
  const stageChangedTo = str(meta.stageChangedTo);
  const stageBefore = str(meta.from);
  // nečitelné datum v metadatech = jako by chybělo (výpis nesmí spadnout)
  const nextContactRaw = str(meta.nextFollowUpAt);
  const nextContact = nextContactRaw === null || Number.isNaN(Date.parse(nextContactRaw)) ? null : new Date(nextContactRaw);
  const note = str(row.body);

  const first = earliest.get(row.leadId);
  const contactType: ContactType =
    first && first.id !== row.id ? "repeat" : row.imported ? "first_recorded_imported" : "first_recorded";

  const terminal =
    (result !== null && TERMINAL_RESULTS.includes(result)) ||
    (stageChangedTo !== null && TERMINAL_STAGES.includes(stageChangedTo));
  const warnings: CallWarning[] = [];
  if (result === null && stageChangedTo === null) warnings.push("missing_result");
  if (note === null) warnings.push("missing_note");
  if (nextContact === null && !terminal) warnings.push("missing_next_contact");

  return {
    activityId: row.id,
    at: row.createdAt.toISOString(),
    atPrague: formatPragueDateTime(row.createdAt),
    contactType,
    result,
    resultLabel: result === null ? null : (CALL_RESULT_LABELS[result as CallResult] ?? result),
    stageBefore,
    stageChangedTo,
    stageChangedToLabel: stageLabel(stageChangedTo),
    note,
    // termín je uložený na 12:00 UTC (validateCallLogInput) → den v Praze sedí
    nextContactDate: nextContact === null ? null : formatPragueDate(nextContact),
    warnings,
  };
}

/**
 * Souhrn hovorů jednoho obchodníka za období. `calls` = jeho call_logged
 * v období seřazené chronologicky; `earliest` = nejstarší call_logged
 * každého z těch leadů napříč celou historií a všemi autory.
 */
export function summarizeCallActivity(
  calls: readonly CallActivityRow[],
  earliest: Map<string, EarliestCallRow>,
  maxDetails: number = MAX_CALL_DETAILS
): CallActivitySummary {
  const byLead = new Map<string, LeadCallSummary>();
  const incompleteRecords: CallActivitySummary["incompleteRecords"] = [];
  let repeatCalls = 0;
  let incompleteCalls = 0;
  let detailed = 0;

  for (const row of calls) {
    const call = describeCall(row, earliest);
    if (call.contactType === "repeat") repeatCalls++;

    let lead = byLead.get(row.leadId);
    if (!lead) {
      lead = {
        leadId: row.leadId,
        name: leadDisplayName(row.lead),
        currentStage: row.lead.stage,
        currentStageLabel: stageLabel(row.lead.stage) ?? row.lead.stage,
        contactType: call.contactType,
        callsInPeriod: 0,
        firstCallAtPrague: call.atPrague,
        lastCallAtPrague: call.atPrague,
        lastResultLabel: null,
        nextContactDate: null,
        incompleteCalls: 0,
        calls: [],
      };
      byLead.set(row.leadId, lead);
    }

    lead.callsInPeriod++;
    lead.lastCallAtPrague = call.atPrague;
    // první kontakt má přednost: lead obvolaný poprvé a pak ještě jednou je
    // pořád "kontaktovaný poprvé" v tomto období
    if (call.contactType !== "repeat") {
      lead.contactType = call.contactType;
    }
    if (call.resultLabel ?? call.stageChangedToLabel) {
      lead.lastResultLabel = call.resultLabel ?? `posun na fázi „${call.stageChangedToLabel}“`;
    }
    if (call.nextContactDate) lead.nextContactDate = call.nextContactDate;

    if (call.warnings.length > 0) {
      incompleteCalls++;
      lead.incompleteCalls++;
      incompleteRecords.push({
        leadId: row.leadId,
        name: lead.name,
        atPrague: call.atPrague,
        warnings: call.warnings.map((w) => CALL_WARNING_LABELS[w]),
      });
    }

    if (detailed < maxDetails) {
      lead.calls.push(call);
      detailed++;
    }
  }

  const leads = [...byLead.values()];
  return {
    totals: {
      recordedCalls: calls.length,
      uniqueLeads: leads.length,
      firstContactLeads: leads.filter((l) => l.contactType !== "repeat").length,
      firstContactImportedLeads: leads.filter((l) => l.contactType === "first_recorded_imported").length,
      repeatOnlyLeads: leads.filter((l) => l.contactType === "repeat").length,
      repeatCalls,
      incompleteCalls,
    },
    leads,
    incompleteRecords: incompleteRecords.slice(0, maxDetails),
    detailsTruncated: calls.length > maxDetails,
  };
}
