// GPT/MCP pilot — čtení leadů pro asistenta (list_leads, get_lead). Čistá
// logika bez "server-only": předvolby, popisky historie a hodnocení stavu
// leadu. Dotazy skládá agentLeads.ts.
//
// "Po termínu" se tu posuzuje podle KALENDÁŘNÍHO dne v Praze (termín
// dalšího kontaktu je uložený jako datum na 12:00 UTC): lead s termínem
// dnes je "na dnes", po termínu je až od zítřka. Kokpit v aplikaci počítá
// s okamžikem 12:00 UTC — v den termínu odpoledne se tedy může lišit
// o leady "na dnes"; asistent je proto vrací zvlášť (due_today).
import { STAGE_LABELS } from "@/app/rizeni-firmy/obchod/leadLabels";
import { CALL_RESULT_LABELS } from "@/app/rizeni-firmy/obchod/dnes/dailyCallLabels";
import { ACTIVE_LEAD_STAGES, type LeadStage } from "./leadValidation";
import type { CallResult } from "./dailyCallsValidation";
import { formatPragueDate, formatPragueDateTime } from "./callActivityValidation";

export const LEAD_PRESETS = [
  "active",
  "new_assigned",
  "never_called",
  "called",
  "overdue",
  "due_today",
  "missing_next_step",
  "no_follow_up_date",
  "closed",
] as const;
export type LeadPreset = (typeof LEAD_PRESETS)[number];

export const LEAD_PRESET_LABELS: Record<LeadPreset, string> = {
  active: "aktivní leady (rozpracované fáze)",
  new_assigned: "nově přidělené obchodníkovi v zadaném období",
  never_called: "bez jediného zaznamenaného hovoru",
  called: "s aspoň jedním zaznamenaným hovorem",
  overdue: "aktivní leady s termínem dalšího kontaktu před dneškem",
  due_today: "aktivní leady s termínem dalšího kontaktu dnes",
  missing_next_step: "aktivní leady bez termínu dalšího kontaktu i bez popisu dalšího kroku",
  no_follow_up_date: "aktivní leady bez termínu dalšího kontaktu",
  closed: "ukončené leady (zákazník nebo nezájem)",
};

export const CLOSED_LEAD_STAGES: LeadStage[] = ["converted", "not_interested"];
export { ACTIVE_LEAD_STAGES };

/** Běžné seznamy: nejvýš 92 dní v jednom datovém filtru. */
export const MAX_LIST_DAYS = 92;

export type LeadState = {
  overdue: boolean;
  dueToday: boolean;
  missingNextStep: boolean;
  noFollowUpDate: boolean;
  closed: boolean;
};

export function leadState(
  lead: { stage: string; nextFollowUpAt: Date | null; nextStepNote: string | null },
  today: string
): LeadState {
  const active = (ACTIVE_LEAD_STAGES as string[]).includes(lead.stage);
  const followUpDay = lead.nextFollowUpAt ? formatPragueDate(lead.nextFollowUpAt) : null;
  const hasNote = lead.nextStepNote !== null && lead.nextStepNote.trim() !== "";
  return {
    overdue: active && followUpDay !== null && followUpDay < today,
    dueToday: active && followUpDay === today,
    missingNextStep: active && followUpDay === null && !hasNote,
    noFollowUpDate: active && followUpDay === null,
    closed: (CLOSED_LEAD_STAGES as string[]).includes(lead.stage),
  };
}

export function stageLabel(stage: string | null): string | null {
  return stage === null ? null : (STAGE_LABELS[stage as LeadStage] ?? stage);
}

// --- Historie leadu ---------------------------------------------------------

export const LEAD_ACTIVITY_LABELS: Record<string, string> = {
  created: "založení leadu",
  stage_changed: "změna fáze",
  owner_assigned: "přiřazení obchodníka",
  acquired_by_set: "původ akvizice",
  call_logged: "zaznamenaný hovor",
  note_added: "poznámka",
  next_step_set: "nastavení dalšího kroku",
  converted: "převod na zákazníka",
  company_name_set: "název firmy",
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function dateOnly(value: unknown): string | null {
  const raw = str(value);
  if (raw === null || Number.isNaN(Date.parse(raw))) return null;
  return formatPragueDate(new Date(raw));
}

/**
 * Vybrané údaje z metadat záznamu historie — nikdy celá metadata (import
 * v nich má technické údaje, které asistent nepotřebuje).
 */
export function describeLeadActivity(entry: { kind: string; metadata: unknown }): Record<string, string | null> {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;
  switch (entry.kind) {
    case "call_logged": {
      const result = str(meta.callResult);
      return {
        result: result === null ? null : (CALL_RESULT_LABELS[result as CallResult] ?? result),
        stageBefore: stageLabel(str(meta.from)),
        stageChangedTo: stageLabel(str(meta.stageChangedTo)),
        nextContactDate: dateOnly(meta.nextFollowUpAt),
      };
    }
    case "stage_changed":
      return { from: stageLabel(str(meta.from)), to: stageLabel(str(meta.to)) };
    case "owner_assigned":
      return { owner: str(meta.ownerName) ?? str(meta.ownerUserId) };
    case "acquired_by_set":
      return { acquiredBy: str(meta.acquiredByName) ?? str(meta.acquiredByUserId) };
    case "next_step_set":
      return { nextContactDate: dateOnly(meta.nextFollowUpAt) }; // text dalšího kroku je v body
    case "company_name_set":
      return { to: str(meta.to) };
    case "converted":
      return { linkedExistingCustomer: meta.linkedExisting ? "ano" : "ne" };
    case "created":
      return { imported: str(meta.importBatch) !== null ? "ano (import z tabulky)" : "ne" };
    default:
      return {};
  }
}

export function activityTime(at: Date) {
  return { at: at.toISOString(), atPrague: formatPragueDateTime(at) };
}
