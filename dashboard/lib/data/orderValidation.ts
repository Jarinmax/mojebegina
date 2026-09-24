// Security Phase 15 (Objednávky 1.0) — čistá validace vstupů pro
// objednávky. Bez "server-only", testovatelné stejně jako
// companyNodeValidation.ts.

export type FulfillmentStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export type PaymentStatus = "unpaid" | "invoiced" | "paid";

export const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

export const PAYMENT_STATUSES: PaymentStatus[] = ["unpaid", "invoiced", "paid"];

const MAX_NAME_LENGTH = 200;
const MAX_CONTACT_LENGTH = 200;
const MAX_NOTE_LENGTH = 2000;
const MAX_ITEMS = 50;

export type CreateOrderItemInput = {
  name: string;
  quantity: string;
  unitPriceKc: string;
};

export type CreateOrderItemValue = {
  name: string;
  quantity: number;
  unitPriceKc: number;
  lineTotalKc: number;
};

export type CreateOrderInput = {
  buyerOrganizationId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  plannedDeliveryAt: string; // "" nebo "YYYY-MM-DD"
  note: string;
  shippingKc: string;
  items: CreateOrderItemInput[];
};

export type CreateOrderValue = {
  buyerOrganizationId: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  plannedDeliveryAt: Date | null;
  note: string | null;
  shippingKc: number;
  subtotalKc: number;
  totalKc: number;
  items: CreateOrderItemValue[];
};

function parseNonNegativeInt(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) {
    return null;
  }
  return Number.parseInt(raw.trim(), 10);
}

// Datum bez znalosti času (jen kalendářní den), stejný princip jako
// existující "12:00 UTC" konvence v lib/data/dashboard.ts — formátování
// i porovnání "je po splatnosti" pak nezávisí na časové zóně.
function parseDateOnly(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function validateCreateOrderInput(
  input: CreateOrderInput
): { ok: true; value: CreateOrderValue } | { ok: false; error: string } {
  const buyerOrganizationId = input.buyerOrganizationId.trim();
  if (!buyerOrganizationId) {
    return { ok: false, error: "Vyberte zákaznickou organizaci." };
  }

  const contactName = input.contactName.trim();
  const contactPhone = input.contactPhone.trim();
  const contactEmail = input.contactEmail.trim();
  if (contactName.length > MAX_CONTACT_LENGTH) {
    return { ok: false, error: `Jméno kontaktu může mít nejvýše ${MAX_CONTACT_LENGTH} znaků.` };
  }
  if (contactPhone.length > MAX_CONTACT_LENGTH) {
    return { ok: false, error: `Telefon může mít nejvýše ${MAX_CONTACT_LENGTH} znaků.` };
  }
  if (contactEmail.length > MAX_CONTACT_LENGTH) {
    return { ok: false, error: `E-mail může mít nejvýše ${MAX_CONTACT_LENGTH} znaků.` };
  }

  const note = input.note.trim();
  if (note.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Poznámka může mít nejvýše ${MAX_NOTE_LENGTH} znaků.` };
  }

  const shippingRaw = input.shippingKc.trim();
  const shippingKc = shippingRaw === "" ? 0 : parseNonNegativeInt(shippingRaw);
  if (shippingKc === null) {
    return { ok: false, error: "Doprava musí být nezáporné celé číslo." };
  }

  let plannedDeliveryAt: Date | null = null;
  if (input.plannedDeliveryAt.trim()) {
    plannedDeliveryAt = parseDateOnly(input.plannedDeliveryAt);
    if (!plannedDeliveryAt) {
      return { ok: false, error: "Neplatné plánované datum doručení." };
    }
  }

  if (input.items.length === 0) {
    return { ok: false, error: "Přidejte alespoň jednu položku." };
  }
  if (input.items.length > MAX_ITEMS) {
    return { ok: false, error: `Objednávka může mít nejvýše ${MAX_ITEMS} položek.` };
  }

  const items: CreateOrderItemValue[] = [];
  for (const rawItem of input.items) {
    const name = rawItem.name.trim();
    if (!name) {
      return { ok: false, error: "Zadejte název u každé položky." };
    }
    if (name.length > MAX_NAME_LENGTH) {
      return { ok: false, error: `Název položky může mít nejvýše ${MAX_NAME_LENGTH} znaků.` };
    }
    const quantity = parseNonNegativeInt(rawItem.quantity);
    if (quantity === null || quantity < 1) {
      return { ok: false, error: `Množství u položky "${name}" musí být kladné celé číslo.` };
    }
    const unitPriceKc = parseNonNegativeInt(rawItem.unitPriceKc);
    if (unitPriceKc === null) {
      return { ok: false, error: `Cena u položky "${name}" musí být nezáporné celé číslo.` };
    }
    items.push({ name, quantity, unitPriceKc, lineTotalKc: quantity * unitPriceKc });
  }

  const subtotalKc = items.reduce((sum, item) => sum + item.lineTotalKc, 0);

  return {
    ok: true,
    value: {
      buyerOrganizationId,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
      plannedDeliveryAt,
      note: note || null,
      shippingKc,
      subtotalKc,
      totalKc: subtotalKc + shippingKc,
      items,
    },
  };
}

export function validateFulfillmentStatusInput(
  status: string
): { ok: true; value: FulfillmentStatus } | { ok: false; error: string } {
  if (!FULFILLMENT_STATUSES.includes(status as FulfillmentStatus)) {
    return { ok: false, error: "Neplatný stav objednávky." };
  }
  return { ok: true, value: status as FulfillmentStatus };
}

export function validatePaymentStatusInput(
  status: string
): { ok: true; value: PaymentStatus } | { ok: false; error: string } {
  if (!PAYMENT_STATUSES.includes(status as PaymentStatus)) {
    return { ok: false, error: "Neplatný stav platby." };
  }
  return { ok: true, value: status as PaymentStatus };
}

export type NoteInput = { body: string };

export function validateNoteInput(
  input: NoteInput
): { ok: true; value: string } | { ok: false; error: string } {
  const body = input.body.trim();
  if (body.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Poznámka může mít nejvýše ${MAX_NOTE_LENGTH} znaků.` };
  }
  return { ok: true, value: body };
}

// "Po splatnosti" se neukládá jako vlastní stav (viz schema.ts komentář) —
// počítá se odsud, z payment_status a splatnosti napojené faktury.
export function isPaymentOverdue(paymentStatus: PaymentStatus, dueAt: Date | null): boolean {
  if (paymentStatus !== "invoiced" || !dueAt) {
    return false;
  }
  return dueAt.getTime() < Date.now();
}
