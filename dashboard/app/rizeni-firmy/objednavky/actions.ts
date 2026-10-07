"use server";

// Security Phase 15 (Objednávky 1.0) — sdílená "use server" hranice pro
// všechny akce nad objednávkami. Logika (autorizace, validace, DB) žije
// v lib/data/orders.ts, stejný princip jako app/rizeni-firmy/node-actions.ts.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createOrder,
  updateFulfillmentStatus,
  updatePaymentStatus,
  recordOrderPayment,
  prepareOrderInvoiceDraft,
  issueOrderInvoice,
  runEshopIdokladPreflight,
  assignResponsible,
  unassignResponsible,
  updateOrderNote,
} from "@/lib/data/orders";

export type ActionState = { error: string } | { success: string } | null;

export type PreflightActionState =
  | { result: import("@/lib/eshop/invoicing/preflight").PreflightResult }
  | { error: string }
  | null;

function revalidateOrder(orderId?: string) {
  revalidatePath("/rizeni-firmy");
  revalidatePath("/rizeni-firmy/objednavky");
  if (orderId) {
    revalidatePath(`/rizeni-firmy/objednavky/${orderId}`);
  }
}

export async function createOrderAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const itemNames = formData.getAll("itemName").map(String);
  const itemQuantities = formData.getAll("itemQuantity").map(String);
  const itemPrices = formData.getAll("itemUnitPriceKc").map(String);

  const items = itemNames
    .map((name, i) => ({ name, quantity: itemQuantities[i] ?? "", unitPriceKc: itemPrices[i] ?? "" }))
    .filter((item) => item.name.trim() !== "");

  const result = await createOrder({
    buyerOrganizationId: String(formData.get("buyerOrganizationId") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    contactPhone: String(formData.get("contactPhone") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    plannedDeliveryAt: String(formData.get("plannedDeliveryAt") ?? ""),
    note: String(formData.get("note") ?? ""),
    shippingKc: String(formData.get("shippingKc") ?? ""),
    items,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidateOrder(result.id);
  redirect(`/rizeni-firmy/objednavky/${result.id}`);
}

export async function updateFulfillmentStatusAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await updateFulfillmentStatus(orderId, String(formData.get("status") ?? ""));
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateOrder(orderId);
  return { success: "Stav objednávky byl uložen." };
}

export async function updatePaymentStatusAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await updatePaymentStatus(orderId, String(formData.get("status") ?? ""));
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateOrder(orderId);
  return { success: "Stav platby byl uložen." };
}

// ESHOP 1.0 — „Zapsat platbu“ (e-shopové objednávky): Zaplaceno se nastaví
// samo, až je uhrazená celá částka (lib/eshop/payments.ts).
export async function recordPaymentAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const field = (key: string) => String(formData.get(key) ?? "");
  const result = await recordOrderPayment(orderId, {
    token: field("token"),
    amountKc: field("amountKc"),
    date: field("date"),
    method: field("method"),
    note: field("note"),
  });
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateOrder(orderId);
  if (!result.recorded) return { success: "Tahle platba už je zapsaná." };
  return { success: result.settled ? "Platba zapsána — objednávka je zaplacená." : "Platba zapsána." };
}

// ESHOP 1.0 — návrh faktury (režim návrhu, do iDokladu se nic neodesílá).
export async function prepareInvoiceDraftAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await prepareOrderInvoiceDraft(orderId, formData.get("regenerate") === "1");
  if (!result.ok) return { error: result.error };
  revalidateOrder(orderId);
  switch (result.result.status) {
    case "created":
      return { success: "Návrh faktury je připravený." };
    case "regenerated":
      return { success: "Návrh faktury je přegenerovaný z aktuálních údajů." };
    default:
      return { error: result.result.reason };
  }
}

export async function issueInvoiceAction(orderId: string): Promise<ActionState> {
  const result = await issueOrderInvoice(orderId);
  revalidateOrder(orderId);
  return result.ok ? { success: result.message } : { error: result.error };
}

/** Kontrola připojení iDokladu — jen čtení, nic se nezapisuje ani neukládá. */
export async function runIdokladPreflightAction(): Promise<PreflightActionState> {
  const outcome = await runEshopIdokladPreflight();
  return outcome.ok ? { result: outcome.result } : { error: outcome.error };
}

export async function assignResponsibleAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const responsibleUserId = String(formData.get("responsibleUserId") ?? "");
  if (!responsibleUserId) {
    return { error: "Vyberte odpovědnou osobu." };
  }

  const result = await assignResponsible(orderId, responsibleUserId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateOrder(orderId);
  return { success: "Odpovědná osoba byla přiřazena." };
}

export async function unassignResponsibleAction(
  orderId: string,
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  void _formData;

  const result = await unassignResponsible(orderId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateOrder(orderId);
  return { success: "Odpovědná osoba byla odebrána." };
}

export async function updateOrderNoteAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await updateOrderNote(orderId, { body: String(formData.get("body") ?? "") });
  if (!result.ok) {
    return { error: result.error };
  }

  revalidateOrder(orderId);
  return { success: "Poznámka byla uložena." };
}
