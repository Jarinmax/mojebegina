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
import { CALL_RESULT_LABELS } from "./dailyCallLabels";
import { formatCzechDateTime } from "@/lib/format";

export type ActionState = { error: string } | { success: string } | null;

// Security Phase 21 (Denní volání 1.1) — bod 3 schváleného zadání: server
// akce musí vrátit dost informací (itemId + přesně to, co se uložilo), aby
// potvrzení mohlo žít MIMO mizející pending kartu (viz
// DailyCallsWorkArea.tsx). Žádná nová kopie poznámky — `note` je jen echo
// téhož zápisu ve stejném requestu, autoritativní zdroj zůstává
// lead_activity.
export type LogCallOutcomeActionState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "saved"; itemId: string; note: string; resultLabel: string; nextFollowUpAtLabel: string | null };

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

// Bug nahlášený na Preview (Vercel error 2923716426): neočekávaná chyba při
// DB zápisu (konkrétně dřívější typová chyba Postgres, viz
// dailyCallsValidation.ts:buildLogDailyCallOutcomeQuery) propadla z téhle
// "use server" akce ven neošetřená — Next.js ji vykreslil jako celostránkový
// pád ("This page couldn't load"), ne jako chybu ve formuláři, takže
// uživatel neměl žádnou šanci zjistit, co se stalo, ani to bezpečně
// zopakovat bez reloadu. Stejný precedent jako
// app/admin/backfill-user-profiles-once/actions.ts: celé tělo akce v
// try/catch, libovolná neočekávaná výjimka se převede na ActionState s
// `error`, který CallOutcomeForm vykreslí přímo ve formuláři. Atomický CTE
// zápis (viz dailyCalls.ts) garantuje, že neúspěšný pokus nenechá žádný
// částečný stav — opakování akce je tedy vždy bezpečné.
export async function logDailyCallOutcomeAction(
  itemId: string,
  _prevState: LogCallOutcomeActionState,
  formData: FormData
): Promise<LogCallOutcomeActionState> {
  try {
    const result = await logDailyCallOutcome(itemId, {
      result: String(formData.get("result") ?? ""),
      note: String(formData.get("note") ?? ""),
      stageChange: String(formData.get("stageChange") ?? ""),
      nextFollowUpAtDate: String(formData.get("nextFollowUpAtDate") ?? ""),
      nextFollowUpAtTime: String(formData.get("nextFollowUpAtTime") ?? ""),
    });

    if (!result.ok) {
      return { status: "error", error: result.error };
    }

    revalidateDailyCalls();
    return {
      status: "saved",
      itemId: result.itemId,
      note: result.note,
      resultLabel: CALL_RESULT_LABELS[result.result],
      nextFollowUpAtLabel: result.nextFollowUpAt ? formatCzechDateTime(result.nextFollowUpAt) : null,
    };
  } catch (error) {
    console.error("logDailyCallOutcomeAction: neočekávaná chyba při zápisu výsledku hovoru", error);
    return {
      status: "error",
      error: "Výsledek hovoru se nepodařilo uložit kvůli neočekávané chybě. Nic se mezitím nezapsalo, zkuste to prosím znovu.",
    };
  }
}
