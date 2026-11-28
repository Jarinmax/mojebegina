"use server";

// Security Phase 16 (Obchod/CRM 1.0) — sdílená "use server" hranice pro
// všechny CRM akce. Logika žije v lib/data/leads.ts, stejný princip jako
// app/rizeni-firmy/objednavky/actions.ts.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getAuthContext } from "@/lib/data/authContext";
import { isDailyCallCurator } from "@/lib/data/dailyCallsAuth";
import { importMetaLeads } from "@/lib/data/metaLeads";
import {
  createLead,
  logCallOutcome,
  logNoAnswer,
  updateLeadStage,
  updateLeadCompanyName,
  updateLeadCompanyDetails,
  assignLeadOwner,
  setLeadAcquiredBy,
  linkLeadToExistingOrganization,
  convertLeadToNewOrganization,
  assignCustomerOwner,
  setCustomerDeliveryAddress, setCustomerPayLaterAllowed,
  setCustomerAcquiredBy,
  removeLeadFollowUp,
  retryLeadCalendarSync,
  addCustomerNote,
} from "@/lib/data/leads";
import type { CreateCustomerInput } from "@/lib/data/createCustomerValidation";

export type ActionState = { error: string } | { success: string } | null;

function revalidateCrm(leadId?: string, organizationId?: string) {
  revalidatePath("/rizeni-firmy");
  revalidatePath("/rizeni-firmy/obchod");
  if (leadId) {
    revalidatePath(`/rizeni-firmy/obchod/leady/${leadId}`);
    revalidatePath(`/rizeni-firmy/obchod/leady/${leadId}/prevest`);
  }
  if (organizationId) {
    revalidatePath(`/rizeni-firmy/obchod/zakaznici/${organizationId}`);
  }
}

export async function createLeadAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const result = await createLead({
    companyName: String(formData.get("companyName") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    contactPhone: String(formData.get("contactPhone") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    city: String(formData.get("city") ?? ""),
    address: String(formData.get("address") ?? ""),
    venueType: String(formData.get("venueType") ?? ""),
    ico: String(formData.get("ico") ?? ""),
    source: String(formData.get("source") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(result.id);
  redirect(`/rizeni-firmy/obchod/leady/${result.id}`);
}

export async function logCallOutcomeAction(
  leadId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await logCallOutcome(leadId, {
    note: String(formData.get("note") ?? ""),
    nextStage: String(formData.get("nextStage") ?? ""),
    nextFollowUpAtDate: String(formData.get("nextFollowUpAtDate") ?? ""),
    nextFollowUpAtTime: String(formData.get("nextFollowUpAtTime") ?? ""),
    nextStepNote: String(formData.get("nextStepNote") ?? ""),
    reached: formData.get("reached") === "1",
    heardFrom: String(formData.get("heardFrom") ?? ""),
    heardFromDetail: String(formData.get("heardFromDetail") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(leadId);
  return { success: "Zápis hovoru byl uložen." };
}

// Security Phase 20 (Google Kalendář 1.0) — samostatná akce, oddělená od
// logCallOutcomeAction výše. Obecný CRM formulář má next_follow_up_at
// nezávisle volitelné vedle poznámky/fáze/dalšího kroku — prázdné pole
// tam znamená "neřešeno", ne "smazat" (viz leadValidation.ts). Explicitní
// smazání proto potřebuje vlastní tlačítko/akci, jinak by nešlo rozlišit
// "uživatel pole nevyplnil" od "uživatel chce termín odstranit".
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tvar (id, state, formData) vyžaduje useActionState, formulář nemá žádná pole
export async function removeLeadFollowUpAction(leadId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const result = await removeLeadFollowUp(leadId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(leadId);
  return { success: "Naplánovaný kontakt byl odstraněn." };
}

// Security Phase 20 (Google Kalendář 1.0) — idempotentní "Zkusit znovu"
// pro lead_calendar_sync ve stavu "failed" (viz retryLeadCalendarSync).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- tvar (id, state, formData) vyžaduje useActionState, formulář nemá žádná pole
export async function retryLeadCalendarSyncAction(leadId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const result = await retryLeadCalendarSync(leadId);
  if (!result.ok) {
    return { error: `Synchronizace s Google kalendářem se nezdařila: ${result.error}` };
  }

  revalidateCrm(leadId);
  return { success: "Synchronizace s Google kalendářem proběhla úspěšně." };
}

export async function updateLeadStageAction(
  leadId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await updateLeadStage(leadId, String(formData.get("stage") ?? ""));
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(leadId);
  return { success: "Obchodní stav byl uložen." };
}

export async function updateLeadCompanyNameAction(
  leadId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await updateLeadCompanyName(leadId, String(formData.get("companyName") ?? ""));
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(leadId);
  return { success: "Název byl uložen." };
}

export async function updateLeadCompanyDetailsAction(
  leadId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await updateLeadCompanyDetails(leadId, {
    companyName: String(formData.get("companyName") ?? ""),
    ico: String(formData.get("ico") ?? ""),
    address: String(formData.get("address") ?? ""),
  });
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(leadId);
  return { success: "Firma byla uložena." };
}

export async function assignLeadOwnerAction(
  leadId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ownerUserId = String(formData.get("ownerUserId") ?? "");
  if (!ownerUserId) {
    return { error: "Vyberte obchodníka." };
  }

  const result = await assignLeadOwner(leadId, ownerUserId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(leadId);
  return { success: "Obchodník byl přiřazen." };
}

export async function setLeadAcquiredByAction(
  leadId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const acquiredByUserId = String(formData.get("acquiredByUserId") ?? "");
  if (!acquiredByUserId) {
    return { error: "Vyberte, kdo leada získal." };
  }

  const result = await setLeadAcquiredBy(leadId, acquiredByUserId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(leadId);
  return { success: "Původ akvizice byl uložen." };
}

export async function linkLeadToExistingOrganizationAction(
  leadId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!organizationId) {
    return { error: "Vyberte organizaci." };
  }

  const result = await linkLeadToExistingOrganization(leadId, organizationId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(leadId, organizationId);
  redirect(`/rizeni-firmy/obchod/zakaznici/${organizationId}`);
}

export async function convertLeadToNewOrganizationAction(
  leadId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const input: CreateCustomerInput = {
    name: String(formData.get("name") ?? ""),
    ico: String(formData.get("ico") ?? ""),
    registeredAddress: String(formData.get("registeredAddress") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
  };

  const result = await convertLeadToNewOrganization(leadId, input);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(leadId, result.organizationId);
  redirect(`/rizeni-firmy/obchod/zakaznici/${result.organizationId}`);
}

export async function assignCustomerOwnerAction(
  organizationId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const ownerUserId = String(formData.get("ownerUserId") ?? "");
  if (!ownerUserId) {
    return { error: "Vyberte obchodníka." };
  }

  const result = await assignCustomerOwner(organizationId, ownerUserId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(undefined, organizationId);
  return { success: "Obchodník byl přiřazen." };
}

export async function setCustomerAcquiredByAction(
  organizationId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const acquiredByUserId = String(formData.get("acquiredByUserId") ?? "");
  if (!acquiredByUserId) {
    return { error: "Vyberte, kdo zákazníka získal." };
  }

  const result = await setCustomerAcquiredBy(organizationId, acquiredByUserId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(undefined, organizationId);
  return { success: "Původ akvizice byl uložen." };
}

export async function addCustomerNoteAction(
  organizationId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await addCustomerNote(organizationId, String(formData.get("body") ?? ""));
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(undefined, organizationId);
  return { success: "Poznámka byla uložena." };
}

// Ruční „Načíst leady z Mety teď“ — jen vedení (kurátor Denního volání).
// Jinak běží automaticky několikrát denně (app/api/cron/meta-leady).
export async function importMetaLeadsNowAction(_prev: ActionState): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!isDailyCallCurator(ctx)) return { error: "Načíst leady může jen vedení." };
  const result = await importMetaLeads(db);
  if (result.status === "not_configured") {
    return { error: "Načítání zatím není nastavené — chybí klíč servisního účtu Google (GOOGLE_SERVICE_ACCOUNT_KEY) na Vercelu." };
  }
  if (result.status === "error") return { error: result.error };
  revalidatePath("/rizeni-firmy/obchod");
  const names = (list: { name: string | null }[]) => list.map((l) => l.name ?? "bez jména").join(", ");
  const parts = [
    result.created.length > 0 ? `nové: ${result.created.length} (${names(result.created)})` : "žádný nový kontakt",
    result.matched.length > 0 ? `už v CRM, doplněna poznámka: ${result.matched.length} (${names(result.matched)})` : null,
    result.skipped.length > 0 ? `přeskočeno: ${result.skipped.length}` : null,
  ].filter(Boolean);
  return { success: `Načteno z tabulky — ${parts.join("; ")}.` };
}

// „Nezvedá“ jedním klepnutím (22. 11. 2026).
export type NoAnswerActionState = { error: string } | { success: string; nextAt: string | null; stop: boolean; suggestEmail: boolean } | null;

export async function logNoAnswerAction(leadId: string, _prev: NoAnswerActionState): Promise<NoAnswerActionState> {
  try {
    const result = await logNoAnswer(leadId);
    if (!result.ok) return { error: result.error };
    revalidatePath(`/rizeni-firmy/obchod/leady/${leadId}`);
    revalidatePath("/rizeni-firmy/obchod");
    return {
      success: result.plan.label,
      nextAt: result.plan.nextAt ? result.plan.nextAt.toISOString() : null,
      stop: result.plan.stop,
      suggestEmail: result.plan.suggestEmail,
    };
  } catch {
    return { error: "Zápis se nepodařil. Zkus to znovu." };
  }
}

export async function setCustomerPayLaterAllowedAction(organizationId: string, allowed: boolean): Promise<ActionState> {
  const result = await setCustomerPayLaterAllowed(organizationId, allowed);
  if (!result.ok) return { error: result.error };
  revalidateCrm(undefined, organizationId);
  revalidatePath("/rizeni-firmy/vyroba");
  return { success: "Uloženo." };
}

export async function setCustomerDeliveryAddressAction(
  organizationId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await setCustomerDeliveryAddress(organizationId, String(formData.get("deliveryAddress") ?? ""));
  if (!result.ok) {
    return { error: result.error };
  }
  revalidateCrm(undefined, organizationId);
  return { success: "Doručovací adresa uložena." };
}

// Newsletter u leadu (28. 11. 2026) — po „ano“ v hovoru odejde potvrzovací e-mail.
export async function sendLeadNewsletterConfirmationAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { sendLeadNewsletterConfirmation } = await import("@/lib/data/leadNewsletter");
  const leadId = String(formData.get("leadId") ?? "");
  const result = await sendLeadNewsletterConfirmation(leadId, formData.get("segment"));
  if (!result.ok) return { error: result.error };
  revalidateCrm(leadId);
  return { success: result.message };
}
