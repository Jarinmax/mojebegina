"use server";

// Security Phase 16 (Obchod/CRM 1.0) — sdílená "use server" hranice pro
// všechny CRM akce. Logika žije v lib/data/leads.ts, stejný princip jako
// app/rizeni-firmy/objednavky/actions.ts.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createLead,
  logCallOutcome,
  updateLeadStage,
  updateLeadCompanyName,
  assignLeadOwner,
  setLeadAcquiredBy,
  linkLeadToExistingOrganization,
  convertLeadToNewOrganization,
  assignCustomerOwner,
  setCustomerAcquiredBy,
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
    nextFollowUpAt: String(formData.get("nextFollowUpAt") ?? ""),
    nextStepNote: String(formData.get("nextStepNote") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidateCrm(leadId);
  return { success: "Zápis hovoru byl uložen." };
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
