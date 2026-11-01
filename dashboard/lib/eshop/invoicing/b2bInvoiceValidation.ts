// B2B faktura z MojeBegina (Luciina řada 2026xxxx) — čistá kontrola vstupu,
// bez DB a bez iDokladu. Faktura nemusí mít objednávku v MojeBegina ani
// e-shop; může být nezaplacená (otevřená), hotově / převodem / kartou,
// s vlastní poznámkou za položkami. Vystavení řeší b2bInvoice.ts.

export const B2B_PAYMENT_METHODS = ["bank_transfer", "cash", "card"] as const;
export type B2bPaymentMethod = (typeof B2B_PAYMENT_METHODS)[number];
export const B2B_PAYMENT_LABELS: Record<B2bPaymentMethod, string> = { bank_transfer: "převodem", cash: "hotově", card: "kartou" };

export const MAX_B2B_ITEMS = 50;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type B2bInvoiceItem = { name: string; quantity: number; unit: string; unitPriceKc: number; totalKc: number };

export type B2bInvoiceInput = {
  ico: string;
  items: B2bInvoiceItem[];
  totalKc: number;
  paymentMethod: B2bPaymentMethod;
  /** true = hned označit jako uhrazenou (FullyPay); false = otevřená, neuhrazená */
  paid: boolean;
  issueDate: string;
  dueDate: string;
  /** text za položkami (např. „Faktura je již uhrazena – neplaťte.“) */
  note: string | null;
  orderNumber: string | null;
  description: string | null;
};

export type B2bInvoiceRaw = {
  ico?: unknown;
  items?: unknown;
  paymentMethod?: unknown;
  paid?: unknown;
  issueDate?: unknown;
  dueDays?: unknown;
  dueDate?: unknown;
  note?: unknown;
  orderNumber?: unknown;
  description?: unknown;
  expectedTotalKc?: unknown;
};

class B2bInputError extends Error {}

function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  const sum = [...ico.slice(0, 7)].reduce((acc, d, i) => acc + Number(d) * (8 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(ico[7]);
}

function validDay(raw: string): boolean {
  const m = DATE_RE.exec(raw);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function text(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new B2bInputError(`${label} musí být text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new B2bInputError(`${label} může mít nejvýše ${max} znaků.`);
  return trimmed === "" ? null : trimmed;
}

/** Kč na 2 desetinná místa (iDoklad počítá v haléřích). */
function money(value: unknown, label: string): number {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || Math.round(n * 100) !== n * 100) {
    throw new B2bInputError(`${label} musí být nezáporné číslo nejvýš na haléře.`);
  }
  return n;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function validateB2bInvoice(raw: B2bInvoiceRaw, today: string): { ok: true; value: B2bInvoiceInput } | { ok: false; error: string } {
  try {
    const ico = (text(raw.ico, 20, "IČO") ?? "").replace(/\s/g, "");
    if (!isValidIco(ico)) throw new B2bInputError(`IČO „${ico}“ není platné (8 číslic s kontrolní číslicí).`);

    if (!Array.isArray(raw.items) || raw.items.length === 0) throw new B2bInputError("Přidejte aspoň jednu položku.");
    if (raw.items.length > MAX_B2B_ITEMS) throw new B2bInputError(`Faktura může mít nejvýše ${MAX_B2B_ITEMS} položek.`);
    const items: B2bInvoiceItem[] = raw.items.map((rawItem, i) => {
      if (!rawItem || typeof rawItem !== "object") throw new B2bInputError(`Položka ${i + 1} musí být objekt.`);
      const item = rawItem as Record<string, unknown>;
      const name = text(item.name, 200, `Název položky ${i + 1}`);
      if (!name) throw new B2bInputError(`Zadejte název u položky ${i + 1}.`);
      const quantity = money(item.quantity, `Množství u „${name}“`);
      if (quantity <= 0) throw new B2bInputError(`Množství u „${name}“ musí být kladné.`);
      const unitPriceKc = money(item.unitPriceKc, `Cena u „${name}“`);
      return { name, quantity, unit: text(item.unit, 10, `Jednotka u „${name}“`) ?? "ks", unitPriceKc, totalKc: round2(quantity * unitPriceKc) };
    });
    const totalKc = round2(items.reduce((sum, i) => sum + i.totalKc, 0));
    if (raw.expectedTotalKc !== undefined && raw.expectedTotalKc !== null) {
      const expected = money(raw.expectedTotalKc, "Kontrolní celková částka");
      if (expected !== totalKc) throw new B2bInputError(`Celková částka nesedí: položky dávají ${totalKc} Kč, podklad uvádí ${expected} Kč. Nic se nevystavilo.`);
    }

    const paymentMethod = (text(raw.paymentMethod, 20, "Způsob úhrady") ?? "bank_transfer") as B2bPaymentMethod;
    if (!B2B_PAYMENT_METHODS.includes(paymentMethod)) throw new B2bInputError(`Způsob úhrady musí být jedno z: ${B2B_PAYMENT_METHODS.join(", ")}.`);
    if (raw.paid !== undefined && raw.paid !== null && typeof raw.paid !== "boolean") throw new B2bInputError("paid musí být true/false.");
    const paid = raw.paid === true;

    const issueDate = text(raw.issueDate, 10, "Datum vystavení") ?? today;
    if (!validDay(issueDate)) throw new B2bInputError("Datum vystavení musí mít tvar RRRR-MM-DD.");
    if (issueDate > today) throw new B2bInputError("Datum vystavení nemůže být v budoucnosti.");
    if (issueDate < addDays(today, -15)) throw new B2bInputError("Datum vystavení může být nejvýš 15 dní zpětně.");

    let dueDate: string;
    const dueRaw = text(raw.dueDate, 10, "Splatnost");
    if (dueRaw !== null) {
      if (!validDay(dueRaw) || dueRaw < issueDate) throw new B2bInputError("Splatnost musí být datum RRRR-MM-DD, nejdřív v den vystavení.");
      dueDate = dueRaw;
    } else {
      const days = raw.dueDays === undefined || raw.dueDays === null ? 14 : Number(raw.dueDays);
      if (!Number.isInteger(days) || days < 0 || days > 90) throw new B2bInputError("Splatnost ve dnech musí být 0–90.");
      dueDate = addDays(issueDate, days);
    }

    return {
      ok: true,
      value: {
        ico,
        items,
        totalKc,
        paymentMethod,
        paid,
        issueDate,
        dueDate,
        note: text(raw.note, 500, "Poznámka"),
        orderNumber: text(raw.orderNumber, 30, "Číslo objednávky"),
        description: text(raw.description, 200, "Popis faktury"),
      },
    };
  } catch (error) {
    if (error instanceof B2bInputError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Upozornění, která uživatel má vidět před vystavením (nic neblokují). */
export function b2bWarnings(value: B2bInvoiceInput): string[] {
  const warnings: string[] = [];
  if (!value.paid && value.note && /uhrazen/i.test(value.note) && !/neuhrazen/i.test(value.note)) {
    warnings.push(`Poznámka „${value.note}“ tvrdí, že je faktura uhrazená, ale vystaví se jako NEUHRAZENÁ (paid=false). Ověřte, co má platit.`);
  }
  if (value.paid && value.paymentMethod === "bank_transfer") {
    warnings.push("Faktura se označí jako uhrazená převodem — jen pokud peníze už opravdu přišly na účet.");
  }
  return warnings;
}
