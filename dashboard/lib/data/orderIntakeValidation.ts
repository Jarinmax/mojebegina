// Příjem objednávky zvenku (asistent přes MCP — např. potvrzená objednávka
// z Gmailu): čistá kontrola a normalizace vstupu, bez "server-only" a bez DB.
// Položky, doprava, kontakt, poznámka a termín doručení se kontrolují STEJNOU
// funkcí jako ruční formulář (validateCreateOrderInput), aby asistent nemohl
// uložit nic, co by neprošlo webem. Dohledání zákazníka, duplicit a zápis je
// v orderIntake.ts.
import { FULFILLMENT_STATUSES, PAYMENT_STATUSES, validateCreateOrderInput, type FulfillmentStatus, type PaymentStatus } from "./orderValidation";

export const ORDER_SOURCES = ["gmail", "eshop", "phone", "manual"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  gmail: "Gmail",
  eshop: "e-shop",
  phone: "telefon",
  manual: "ruční zadání",
};

/** Stav objednávky při založení — storno se nezakládá. */
export const INTAKE_FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = FULFILLMENT_STATUSES.filter((s) => s !== "cancelled");

const MAX_TEXT = 200;
const MAX_ADDRESS = 500;
const MAX_REFERENCE = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type OrderIntakeItemInput = { name: string; quantity: number | string; unitPriceKc: number | string; sku?: string | null };

export type OrderIntakeInput = {
  source: string;
  externalReference?: string | null;
  /** existující zákazník (id organizace) — přednost před IČO */
  organizationId?: string | null;
  customerIco?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  customerDic?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  items: OrderIntakeItemInput[];
  shippingKc?: number | string | null;
  shippingMethod?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
  /** YYYY-MM-DD (Europe/Prague); výchozí dnes */
  orderedAt?: string | null;
  /** YYYY-MM-DD — požadovaný termín doručení */
  plannedDeliveryAt?: string | null;
  deliveryName?: string | null;
  deliveryAddress?: string | null;
  deliveryPhone?: string | null;
  note?: string | null;
  customerNote?: string | null;
  /** jméno nebo e-mail odpovědné osoby */
  responsible?: string | null;
  /** kontrolní součet z podkladu (např. z e-mailu) — musí sedět s položkami + dopravou */
  expectedTotalKc?: number | string | null;
};

export type OrderIntakeItem = { name: string; quantity: number; unitPriceKc: number; lineTotalKc: number; sku: string | null };

export type OrderIntakeValue = {
  source: OrderSource;
  externalReference: string | null;
  customer:
    | { kind: "id"; organizationId: string; ico: string | null }
    | { kind: "ico"; ico: string; name: string | null; registeredAddress: string | null; dic: string | null }
    | { kind: "search"; name: string | null };
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  items: OrderIntakeItem[];
  subtotalKc: number;
  shippingKc: number;
  totalKc: number;
  shippingMethod: string | null;
  paymentMethod: string | null;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  orderedAt: string;
  plannedDeliveryAt: string | null;
  deliveryName: string | null;
  deliveryAddress: string | null;
  deliveryPhone: string | null;
  note: string | null;
  customerNote: string | null;
  responsible: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: string | null | undefined, max: number, label: string): string | null {
  const trimmed = (value ?? "").trim().replace(/\s+/g, " ");
  if (trimmed.length > max) throw new IntakeError(`${label} může mít nejvýše ${max} znaků.`);
  return trimmed === "" ? null : trimmed;
}

class IntakeError extends Error {}

function validDate(raw: string): boolean {
  const m = DATE_RE.exec(raw);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** IČO: 8 číslic a kontrolní číslice (mod 11) — překlep v IČO nesmí založit cizí firmu. */
export function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  const sum = [...ico.slice(0, 7)].reduce((acc, digit, i) => acc + Number(digit) * (8 - i), 0);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(ico[7]);
}

/** Telefon jen pro porovnání: posledních 9 číslic (bez +420, mezer, pomlček). */
export function phoneKey(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/** Název firmy pro hledání: bez diakritiky, právní formy a interpunkce. */
export function companyNameKey(name: string | null): string | null {
  const key = (name ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(s\.?\s?r\.?\s?o\.?|spol\.?|a\.?\s?s\.?|v\.?\s?o\.?\s?s\.?|k\.?\s?s\.?|z\.?\s?s\.?|o\.?\s?p\.?\s?s\.?)(?=\s|$|,)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key.length >= 3 ? key : null;
}

function intOrNull(raw: number | string | null | undefined, label: string): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) throw new IntakeError(`${label} musí být nezáporné celé číslo (Kč).`);
  return Number(s);
}

export function validateOrderIntake(
  input: OrderIntakeInput,
  today: string
): { ok: true; value: OrderIntakeValue } | { ok: false; error: string } {
  try {
    if (!ORDER_SOURCES.includes(input.source as OrderSource)) {
      throw new IntakeError(`Zdroj objednávky musí být jedno z: ${ORDER_SOURCES.join(", ")}.`);
    }
    const source = input.source as OrderSource;
    const externalReference = text(input.externalReference, MAX_REFERENCE, "Externí číslo objednávky");
    if ((source === "gmail" || source === "eshop") && !externalReference) {
      throw new IntakeError("U objednávky z Gmailu nebo e-shopu zadejte externí číslo (číslo objednávky z e-mailu / e-shopu, případně ID e-mailu) — chrání proti dvojímu zápisu.");
    }

    // zákazník
    const organizationId = text(input.organizationId, 36, "organization_id");
    const icoRaw = text(input.customerIco, 20, "IČO")?.replace(/\s/g, "") ?? null;
    if (icoRaw !== null && !isValidIco(icoRaw)) throw new IntakeError(`IČO ${icoRaw} není platné (8 číslic s kontrolní číslicí).`);
    const customerName = text(input.customerName, MAX_TEXT, "Název zákazníka");
    const customerAddress = text(input.customerAddress, MAX_ADDRESS, "Sídlo zákazníka");
    const dicRaw = text(input.customerDic, 20, "DIČ")?.replace(/\s/g, "").toUpperCase() ?? null;
    if (dicRaw !== null && !/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(dicRaw)) throw new IntakeError("DIČ musí mít tvar např. CZ12345678.");
    let customer: OrderIntakeValue["customer"];
    if (organizationId !== null) {
      if (!UUID_RE.test(organizationId)) throw new IntakeError("organization_id musí být id (UUID) zákazníka z MojeBegina.");
      customer = { kind: "id", organizationId: organizationId.toLowerCase(), ico: icoRaw };
    } else if (icoRaw !== null) {
      customer = { kind: "ico", ico: icoRaw, name: customerName, registeredAddress: customerAddress, dic: dicRaw };
    } else {
      customer = { kind: "search", name: customerName };
    }

    const contactEmail = text(input.contactEmail, MAX_TEXT, "E-mail")?.toLowerCase() ?? null;
    if (contactEmail !== null && !EMAIL_RE.test(contactEmail)) throw new IntakeError(`E-mail „${contactEmail}“ nemá platný tvar.`);

    // položky, doprava, kontakt, poznámka a termín — stejná kontrola jako ruční formulář
    const shippingKc = intOrNull(input.shippingKc, "Doprava") ?? 0;
    const orderedAt = text(input.orderedAt, 10, "Datum objednávky") ?? today;
    if (!validDate(orderedAt)) throw new IntakeError("Datum objednávky musí mít tvar RRRR-MM-DD.");
    if (orderedAt > today) throw new IntakeError("Datum objednávky nemůže být v budoucnosti.");
    const plannedDeliveryAt = text(input.plannedDeliveryAt, 10, "Termín doručení");
    if (plannedDeliveryAt !== null && !validDate(plannedDeliveryAt)) throw new IntakeError("Termín doručení musí mít tvar RRRR-MM-DD.");
    if (!Array.isArray(input.items)) throw new IntakeError("Položky musí být seznam.");
    const base = validateCreateOrderInput({
      buyerOrganizationId: "x",
      contactName: input.contactName ?? "",
      contactPhone: input.contactPhone ?? "",
      contactEmail: contactEmail ?? "",
      plannedDeliveryAt: plannedDeliveryAt ?? "",
      note: input.note ?? "",
      shippingKc: String(shippingKc),
      items: input.items.map((item) => ({
        name: String(item?.name ?? ""),
        quantity: String(item?.quantity ?? ""),
        unitPriceKc: String(item?.unitPriceKc ?? ""),
      })),
    });
    if (!base.ok) throw new IntakeError(base.error);
    const items: OrderIntakeItem[] = base.value.items.map((item, i) => {
      const sku = text(input.items[i]?.sku ?? null, 100, "SKU");
      return { ...item, sku: sku?.toLowerCase() ?? null };
    });

    const expectedTotalKc = intOrNull(input.expectedTotalKc, "Kontrolní celková cena");
    if (expectedTotalKc !== null && expectedTotalKc !== base.value.totalKc) {
      throw new IntakeError(
        `Celková cena nesedí: položky ${base.value.subtotalKc} Kč + doprava ${shippingKc} Kč = ${base.value.totalKc} Kč, podklad uvádí ${expectedTotalKc} Kč. Zkontrolujte množství, ceny a dopravu; slevu promítněte do jednotkových cen.`
      );
    }

    const paymentStatus = (text(input.paymentStatus, 20, "Stav platby") ?? "unpaid") as PaymentStatus;
    if (!PAYMENT_STATUSES.includes(paymentStatus)) throw new IntakeError(`Stav platby musí být jedno z: ${PAYMENT_STATUSES.join(", ")}.`);
    const fulfillmentStatus = (text(input.fulfillmentStatus, 30, "Stav objednávky") ?? "new") as FulfillmentStatus;
    if (!INTAKE_FULFILLMENT_STATUSES.includes(fulfillmentStatus)) {
      throw new IntakeError(`Stav objednávky musí být jedno z: ${INTAKE_FULFILLMENT_STATUSES.join(", ")}.`);
    }

    return {
      ok: true,
      value: {
        source,
        externalReference,
        customer,
        contactName: base.value.contactName,
        contactEmail: base.value.contactEmail,
        contactPhone: base.value.contactPhone,
        items,
        subtotalKc: base.value.subtotalKc,
        shippingKc,
        totalKc: base.value.totalKc,
        shippingMethod: text(input.shippingMethod, MAX_TEXT, "Způsob dopravy"),
        paymentMethod: text(input.paymentMethod, MAX_TEXT, "Způsob platby"),
        paymentStatus,
        fulfillmentStatus,
        orderedAt,
        plannedDeliveryAt,
        deliveryName: text(input.deliveryName, MAX_TEXT, "Příjemce"),
        deliveryAddress: text(input.deliveryAddress, MAX_ADDRESS, "Doručovací adresa"),
        deliveryPhone: text(input.deliveryPhone, MAX_TEXT, "Telefon příjemce"),
        note: base.value.note,
        customerNote: text(input.customerNote, 2000, "Poznámka zákazníka"),
        responsible: text(input.responsible, MAX_TEXT, "Odpovědná osoba"),
      },
    };
  } catch (error) {
    if (error instanceof IntakeError) return { ok: false, error: error.message };
    throw error;
  }
}
