"use server";

// Security Phase 19 (Denní volání 1.0) — sdílená "use server" hranice,
// stejný princip jako ../actions.ts. Logika žije v lib/data/dailyCalls.ts.
//
// Bug nahlášený na Preview: "Odebrat" a ostatní akční tlačítka (Přidat,
// Navrhnout, šipky pořadí, Zveřejnit) nedávaly po kliknutí žádnou
// viditelnou odezvu, takže šlo odeslat akci podruhé dřív, než doběhla
// první (dvojklik odebral dvě položky místo jedné). Všechny akce teď mají
// tvar (state, formData) => ActionState kompatibilní s useActionState,
// aby volající klientská komponenta uměla tlačítko po prvním kliknutí
// deaktivovat a zobrazit stav probíhající akce — a zároveň se předtím
// tiše zahazovaný `{ ok: false, error }` výsledek z dailyCalls.ts teď
// skutečně dostane až k uživateli.
import { revalidatePath } from "next/cache";
import {
  generateDraftCandidates,
  addManualCandidate,
  removeQueueItem,
  publishDraft,
  moveQueueItemUp,
  moveQueueItemDown,
  logDailyCallOutcome,
} from "@/lib/data/dailyCalls";

export type ActionState = { error: string } | { success: string } | null;

function revalidateDailyCalls() {
  revalidatePath("/rizeni-firmy/obchod/dnes");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tvar (state, formData) vyžaduje useActionState, formulář nemá žádná pole
export async function generateDraftCandidatesAction(_prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const result = await generateDraftCandidates();
  revalidateDailyCalls();
  return result.added > 0 ? { success: `Navrženo ${result.added} nových kontaktů.` } : { success: "Není co navrhnout — žádný vhodný kandidát." };
}

export async function addManualCandidateAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) {
    return { error: "Vyberte lead k přidání." };
  }

  const result = await addManualCandidate(leadId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateDailyCalls();
  return { success: "Lead byl přidán do návrhu." };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tvar (state, formData) vyžaduje useActionState, formulář nemá žádná pole
export async function removeQueueItemAction(itemId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const result = await removeQueueItem(itemId);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidateDailyCalls();
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tvar (state, formData) vyžaduje useActionState, formulář nemá žádná pole
export async function publishDraftAction(_prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const result = await publishDraft();
  revalidateDailyCalls();
  return { success: `Zveřejněno ${result.published} kontaktů.` };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tvar (state, formData) vyžaduje useActionState, formulář nemá žádná pole
export async function moveQueueItemUpAction(itemId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const result = await moveQueueItemUp(itemId);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidateDailyCalls();
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tvar (state, formData) vyžaduje useActionState, formulář nemá žádná pole
export async function moveQueueItemDownAction(itemId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const result = await moveQueueItemDown(itemId);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidateDailyCalls();
  return null;
}

export async function logDailyCallOutcomeAction(
  itemId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await logDailyCallOutcome(itemId, {
    result: String(formData.get("result") ?? ""),
    note: String(formData.get("note") ?? ""),
    stageChange: String(formData.get("stageChange") ?? ""),
    nextFollowUpAt: String(formData.get("nextFollowUpAt") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidateDailyCalls();
  return { success: "Výsledek hovoru byl uložen." };
}
