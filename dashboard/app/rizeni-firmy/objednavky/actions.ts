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
  recordOrderPaymentAfterCancellation,
  requestOrderRefund,
  recordOrderRefund,
  transferOrderPayment,
  type StatusChangeResult,
} from "@/lib/data/orders";
import { FULFILLMENT_LABELS, PAYMENT_LABELS } from "@/lib/data/orderLabels";

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

/** Výsledek uložení stavu → jednoznačná hláška podle skutečného stavu v DB. */
function statusMessage(
  result: StatusChangeResult,
  labels: Readonly<Record<string, string>>,
  what: string
): ActionState {
  if (!result.ok) return { error: result.error };
  const label = labels[result.status] ?? result.status;
  if (!result.changed) return { success: `${what} se nezměnil — je „${label}“.` };
  const parts = [`Uloženo — ${what.toLowerCase()} je „${label}“.`];
  const c = result.cancellation;
  if (c) {
    if (c.email?.status === "sent") parts.push("Zákazníkovi odešel e-mail o zrušení.");
    else if (c.email?.status === "duplicate") parts.push("E-mail o zrušení už zákazník dostal dříve.");
    else if (c.email?.status === "failed") parts.push("⚠ E-mail o zrušení se nepodařilo odeslat — kontaktujte zákazníka.");
    else if (c.email?.status === "no-recipient") parts.push("Zákazník nemá e-mail — informujte ho jinak.");
    if (c.heldHal > 0) parts.push("Objednávka je zaplacená — kontaktujte zákazníka (jiný produkt, nebo vrácení peněz).");
  }
  return { success: parts.join(" ") };
}

export async function updateFulfillmentStatusAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const expected = formData.get("expectedStatus");
  const result = await updateFulfillmentStatus(
    orderId,
    String(formData.get("status") ?? ""),
    typeof expected === "string" && expected ? expected : undefined
  );
  // i při souběhu obnovit stránku — formulář pak ukáže aktuální stav z DB
  revalidateOrder(orderId);
  return statusMessage(result, FULFILLMENT_LABELS, "Stav objednávky");
}

export async function updatePaymentStatusAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const expected = formData.get("expectedStatus");
  const result = await updatePaymentStatus(
    orderId,
    String(formData.get("status") ?? ""),
    typeof expected === "string" && expected ? expected : undefined
  );
  revalidateOrder(orderId);
  return statusMessage(result, PAYMENT_LABELS, "Stav platby");
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

// --- Peníze stornované objednávky (lib/eshop/cancellation.ts) ---------

const kcText = (hal: number) =>
  `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(hal / 100)} Kč`;

function moneyFields(formData: FormData) {
  const field = (key: string) => String(formData.get(key) ?? "");
  return { txId: field("txId"), amountKc: field("amountKc"), date: field("date"), method: field("method"), note: field("note") };
}

export async function recordPaymentAfterCancellationAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await recordOrderPaymentAfterCancellation(orderId, moneyFields(formData));
  if (!result.ok) return { error: result.error };
  revalidateOrder(orderId);
  return {
    success: result.recorded
      ? "Platba po stornu zapsána. Objednávka zůstává stornovaná — kontaktujte zákazníka."
      : "Platba s tímto ID transakce už je zapsaná.",
  };
}

export async function requestRefundAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await requestOrderRefund(orderId, {
    consent: formData.get("consent") === "on",
    note: String(formData.get("note") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  revalidateOrder(orderId);
  return { success: `Zákazník požaduje vrácení ${kcText(result.heldHal)} — po vrácení ho zapište.` };
}

export async function recordRefundAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await recordOrderRefund(orderId, moneyFields(formData));
  if (!result.ok) return { error: result.error };
  revalidateOrder(orderId);
  if (!result.recorded) return { success: "Vrácení s tímto ID transakce už je zapsané." };
  return {
    success:
      result.remainingHal > 0
        ? `Vrácení zapsáno. Zbývá vrátit ${kcText(result.remainingHal)}.`
        : "Vrácení zapsáno — peníze jsou vrácené celé.",
  };
}

export async function transferPaymentAction(
  orderId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = await transferOrderPayment(orderId, {
    target: String(formData.get("target") ?? ""),
    consent: formData.get("consent") === "on",
    note: String(formData.get("note") ?? ""),
    allowDifferentCustomer: formData.get("differentCustomer") === "on",
  });
  if (!result.ok) return { error: result.error };
  revalidateOrder(orderId);
  revalidateOrder(result.target.id);
  const ref = result.target.orderNumber ?? result.target.paymentVs ?? result.target.id.slice(0, 8);
  return {
    success: `Platba ${kcText(result.movedHal)} převedena na objednávku ${ref} (${result.target.contactName ?? "bez jména"})${
      result.settled ? " — ta je teď zaplacená." : " — zákazník ji ještě doplatí."
    }`,
  };
}
