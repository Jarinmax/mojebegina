// Security Phase 17 (CEO přehled 1.0) — čistá validace, bez "server-only",
// stejný princip jako companyNodeValidation.ts: testovatelná bez databáze,
// kontrola a dotaz se skládají až v ceoFocus.ts.

export type FocusStatus = "green" | "amber" | "red";
export type FocusPriority = "low" | "medium" | "high" | "critical";

export const FOCUS_STATUSES: FocusStatus[] = ["green", "amber", "red"];
export const FOCUS_PRIORITIES: FocusPriority[] = ["low", "medium", "high", "critical"];

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_REASON_LENGTH = 500;
const MAX_NEXT_STEP_LENGTH = 500;
const MAX_COMMENT_LENGTH = 2000;

function trimOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type CreateFocusProjectInput = { title: string };
export type CreateFocusProjectValue = { title: string };

export function validateCreateFocusProjectInput(
  input: CreateFocusProjectInput
): { ok: true; value: CreateFocusProjectValue } | { ok: false; error: string } {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "Zadejte název projektu." };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `Název může mít nejvýše ${MAX_TITLE_LENGTH} znaků.` };
  }
  return { ok: true, value: { title } };
}

// Rychlá aktualizace projektu — jeden formulář, jeden submit, stejný
// princip jako CallLogForm/logCallOutcome v CRM. Všechna pole nepovinná —
// Jaroslav/Jiří můžou zapsat jen posun stavu, jen další krok, nebo
// cokoliv dohromady.
export type UpdateFocusProjectInput = {
  note: string;
  status: string;
  statusReason: string;
  priority: string;
  description: string;
  nextStep: string;
};

export type UpdateFocusProjectValue = {
  note: string | null;
  status: FocusStatus | null;
  statusReason: string | null;
  priority: FocusPriority | null;
  description: string | null;
  nextStep: string | null;
};

export function validateUpdateFocusProjectInput(
  input: UpdateFocusProjectInput
): { ok: true; value: UpdateFocusProjectValue } | { ok: false; error: string } {
  const note = trimOrNull(input.note);
  if (note && note.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Poznámka může mít nejvýše ${MAX_COMMENT_LENGTH} znaků.` };
  }

  const statusRaw = trimOrNull(input.status);
  let status: FocusStatus | null = null;
  if (statusRaw) {
    if (!FOCUS_STATUSES.includes(statusRaw as FocusStatus)) {
      return { ok: false, error: "Neplatný stav." };
    }
    status = statusRaw as FocusStatus;
  }

  const statusReason = trimOrNull(input.statusReason);
  if (statusReason && statusReason.length > MAX_REASON_LENGTH) {
    return { ok: false, error: `Popis blockeru/důvodu může mít nejvýše ${MAX_REASON_LENGTH} znaků.` };
  }

  const priorityRaw = trimOrNull(input.priority);
  let priority: FocusPriority | null = null;
  if (priorityRaw) {
    if (!FOCUS_PRIORITIES.includes(priorityRaw as FocusPriority)) {
      return { ok: false, error: "Neplatná priorita." };
    }
    priority = priorityRaw as FocusPriority;
  }

  const description = trimOrNull(input.description);
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: `Popis může mít nejvýše ${MAX_DESCRIPTION_LENGTH} znaků.` };
  }

  const nextStep = trimOrNull(input.nextStep);
  if (nextStep && nextStep.length > MAX_NEXT_STEP_LENGTH) {
    return { ok: false, error: `Další krok může mít nejvýše ${MAX_NEXT_STEP_LENGTH} znaků.` };
  }

  // Stejná UX past jako u CallLogForm (Security Phase 16.5) — prázdný
  // update se má odmítnout, ne tiše vytvořit prázdný activity záznam.
  if (!note && !status && !priority && !description && !nextStep) {
    return { ok: false, error: "Aktualizace je prázdná — vyplňte alespoň jedno pole." };
  }

  return { ok: true, value: { note, status, statusReason, priority, description, nextStep } };
}

const PRIORITY_RANK: Record<FocusPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export type FocusProjectSortRow = {
  id: string;
  priority: FocusPriority;
  isActiveNow: boolean;
  updatedAt: Date;
};

// Deterministické řazení seznamu projektů (stejný důvod jako u
// compareLeadsForList v CRM — Security Phase 16.4: žádné pole beze
// stabilního tiebreaku, aby update jednoho projektu neposunul ostatní
// náhodně). Aktivní projekt VŽDY první (splňuje "na čem pracuji TEĎ musí
// být vidět okamžitě"), pak podle priority, pak nejnovější aktualizace
// první, id jako definitivní rozhodčí.
export function compareFocusProjectsForList(a: FocusProjectSortRow, b: FocusProjectSortRow): number {
  if (a.isActiveNow !== b.isActiveNow) {
    return a.isActiveNow ? -1 : 1;
  }
  const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priorityDiff !== 0) return priorityDiff;

  const updatedDiff = b.updatedAt.getTime() - a.updatedAt.getTime();
  if (updatedDiff !== 0) return updatedDiff;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export type CommentInput = { body: string };

export function validateFocusCommentInput(
  input: CommentInput
): { ok: true; value: string } | { ok: false; error: string } {
  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: "Zadejte text poznámky." };
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Poznámka může mít nejvýše ${MAX_COMMENT_LENGTH} znaků.` };
  }
  return { ok: true, value: body };
}
