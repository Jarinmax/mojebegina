// Security Phase 12 (Řízení firmy 2.0) — čistá validace vstupů pro uzly
// živé mapy firmy. Bez "server-only", testovatelné stejně jako
// companyNoteValidation.ts.

export type NodeStatus = "green" | "amber" | "red";
export type NodePriority = "low" | "medium" | "high" | "critical";

export const NODE_STATUSES: NodeStatus[] = ["green", "amber", "red"];
export const NODE_PRIORITIES: NodePriority[] = ["low", "medium", "high", "critical"];

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_REASON_LENGTH = 500;
const MAX_COMMENT_LENGTH = 2000;

// Schválená specifikace: MVP UI podporuje 3 úrovně (Oblast → Podoblast →
// Téma). Model samotný zůstává obecný (rekurzivní parent_id bez omezení
// v DB) — hloubka se hlídá tady, v datové vrstvě, aby šla později uvolnit
// bez migrace schématu.
export const MAX_TREE_DEPTH = 3;

export type CreateNodeInput = {
  title: string;
  description: string;
  priority: string;
};

export type CreateNodeValue = {
  title: string;
  description: string | null;
  priority: NodePriority;
};

export function validateCreateNodeInput(
  input: CreateNodeInput
): { ok: true; value: CreateNodeValue } | { ok: false; error: string } {
  const title = input.title.trim();
  const description = input.description.trim();
  const priority = input.priority as NodePriority;

  if (!title) {
    return { ok: false, error: "Zadejte název." };
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `Název může mít nejvýše ${MAX_TITLE_LENGTH} znaků.` };
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: `Popis může mít nejvýše ${MAX_DESCRIPTION_LENGTH} znaků.` };
  }
  if (!NODE_PRIORITIES.includes(priority)) {
    return { ok: false, error: "Neplatná priorita." };
  }

  return { ok: true, value: { title, description: description || null, priority } };
}

// `ancestorCount` = počet úrovní NAD nově vytvářeným uzlem (0 pro novou
// Oblast, 1 pro Podoblast pod Oblastí, ...). Nový uzel by tak měl hloubku
// `ancestorCount + 1` — musí zůstat <= MAX_TREE_DEPTH.
export function validateTreeDepth(
  ancestorCount: number
): { ok: true } | { ok: false; error: string } {
  if (ancestorCount + 1 > MAX_TREE_DEPTH) {
    return { ok: false, error: `Strom může mít nejvýše ${MAX_TREE_DEPTH} úrovně.` };
  }
  return { ok: true };
}

export type UpdateStatusInput = {
  status: string;
  reason: string;
};

export type UpdateStatusValue = { status: NodeStatus; reason: string };

export function validateStatusInput(
  input: UpdateStatusInput
): { ok: true; value: UpdateStatusValue } | { ok: false; error: string } {
  const status = input.status as NodeStatus;
  const reason = input.reason.trim();

  if (!NODE_STATUSES.includes(status)) {
    return { ok: false, error: "Neplatný stav." };
  }
  if (!reason) {
    return { ok: false, error: "Zadejte důvod ruční změny stavu." };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return { ok: false, error: `Důvod může mít nejvýše ${MAX_REASON_LENGTH} znaků.` };
  }

  return { ok: true, value: { status, reason } };
}

export function validatePriorityInput(
  priority: string
): { ok: true; value: NodePriority } | { ok: false; error: string } {
  if (!NODE_PRIORITIES.includes(priority as NodePriority)) {
    return { ok: false, error: "Neplatná priorita." };
  }
  return { ok: true, value: priority as NodePriority };
}

export type CommentInput = { body: string };
export type CommentValue = { body: string };

export function validateCommentInput(
  input: CommentInput
): { ok: true; value: CommentValue } | { ok: false; error: string } {
  const body = input.body.trim();

  if (!body) {
    return { ok: false, error: "Zadejte text komentáře." };
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Komentář může mít nejvýše ${MAX_COMMENT_LENGTH} znaků.` };
  }

  return { ok: true, value: { body } };
}

// Nabídnutí se k převzetí — volitelný doprovodný text, prázdný text se
// nahradí výchozí zprávou (viz companyNodes.ts, offerClaim).
export function validateClaimInput(
  body: string
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = body.trim();
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: `Text může mít nejvýše ${MAX_COMMENT_LENGTH} znaků.` };
  }
  return { ok: true, value: trimmed };
}
