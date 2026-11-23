// Úpravy vystavených faktur MojeBegina (Lucie 23. 11. 2026, neplátce DPH):
// upravit (stejné číslo, nová verze), stornovat (číslo zůstane, nepočítá se),
// smazat jen poslední neodeslanou. Postup jako u vystavení: náhled → souhlas
// → provedení se stejným otiskem (fingerprint), aby se nezměnilo nic jiného.
import { createHash } from "node:crypto";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { isDiscountLine } from "./b2bInvoiceValidation";
import { formatKc, snapshotProblems, type OwnInvoiceSnapshot } from "./ownInvoice";
import { cancelOwnDocument, deleteOwnDocument, loadOwnDocument, OwnIssueError, updateOwnDocument, type OwnDocumentRow } from "./ownIssue";
import { sql } from "drizzle-orm";

type Db = NeonHttpDatabase<typeof schema>;

export const OWN_PAYMENT_METHODS = ["bank_transfer", "cash", "card"] as const;
export type OwnChangeMethod = (typeof OWN_PAYMENT_METHODS)[number];
const METHOD_LABEL: Record<OwnChangeMethod, string> = { bank_transfer: "převodem", cash: "hotově", card: "kartou" };

export type OwnChangeItem = { name: string; quantity: number; unit?: string | null; unitPriceKc: number };

export type OwnChangeInput = {
  number: string;
  action: "edit" | "cancel" | "delete";
  /** edit */
  paymentMethod?: OwnChangeMethod | null;
  /** edit: datum úhrady (uhrazeno), false = vrátit na neuhrazenou */
  paidDate?: string | false | null;
  items?: OwnChangeItem[] | null;
  /** edit: text za položkami; "" = smazat */
  note?: string | null;
  dueDate?: string | null;
  /** cancel */
  reason?: string | null;
};

export type OwnChangePreview = {
  document: {
    number: string;
    state: "issued" | "cancelled";
    customer: string;
    totalKc: number;
    paid: boolean;
    paymentMethod: string;
    sentToCustomer: boolean;
    orderId: string | null;
    version: number;
  };
  action: OwnChangeInput["action"];
  changes: string[];
  blocking: string[];
  warnings: string[];
  fingerprint: string;
  newSnapshot: OwnInvoiceSnapshot | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function czDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

/** Nový snímek podle úprav + popis změn; chyby vstupu jdou do blocking. */
export function applyEdit(current: OwnInvoiceSnapshot, input: OwnChangeInput, today: string): { snapshot: OwnInvoiceSnapshot; changes: string[]; blocking: string[] } {
  const s: OwnInvoiceSnapshot = JSON.parse(JSON.stringify(current));
  const changes: string[] = [];
  const blocking: string[] = [];
  if (input.paymentMethod && input.paymentMethod !== s.paymentMethod) {
    changes.push(`Způsob úhrady: ${METHOD_LABEL[s.paymentMethod as OwnChangeMethod] ?? s.paymentMethod} → ${METHOD_LABEL[input.paymentMethod]}`);
    s.paymentMethod = input.paymentMethod;
  }
  if (input.items && input.items.length > 0) {
    const lines = input.items.map((i) => {
      const name = i.name.trim();
      const unit = i.unit?.trim() || "ks";
      if (!name) blocking.push("Položka bez názvu.");
      if (!(i.quantity > 0)) blocking.push(`Množství u „${name}“ musí být kladné.`);
      if (i.unitPriceKc < 0 && !isDiscountLine(name)) blocking.push(`Zápornou cenu smí mít jen řádek „Sleva“ (ne „${name}“).`);
      return { name: unit !== "ks" ? `${name} (${unit})` : name, quantity: i.quantity, unitPriceKc: i.unitPriceKc, totalKc: round2(i.quantity * i.unitPriceKc) };
    });
    const total = round2(lines.reduce((a, l) => a + l.totalKc, 0));
    const before = s.lines.map((l) => `${l.quantity}× ${l.name} ${formatKc(l.unitPriceKc)}`).join("; ");
    const after = lines.map((l) => `${l.quantity}× ${l.name} ${formatKc(l.unitPriceKc)}`).join("; ");
    if (before !== after) {
      changes.push(`Položky: ${before} → ${after}`);
      if (total !== s.totalKc) changes.push(`Celkem: ${formatKc(s.totalKc)} → ${formatKc(total)}`);
      s.lines = lines;
      s.totalKc = total;
    }
  }
  if (input.dueDate) {
    if (!DAY_RE.test(input.dueDate)) blocking.push("Splatnost musí být RRRR-MM-DD.");
    else if (input.dueDate !== s.dueDate) {
      changes.push(`Splatnost: ${czDay(s.dueDate)} → ${czDay(input.dueDate)}`);
      s.dueDate = input.dueDate;
    }
  }
  if (input.paidDate === false) {
    if (s.paidDate) {
      changes.push(`Úhrada: uhrazeno ${czDay(s.paidDate)} → NEUHRAZENO (na PDF výzva k platbě${s.paymentMethod === "bank_transfer" ? " a QR kód" : ""})`);
      s.paidDate = null;
    }
  } else if (input.paidDate) {
    if (!DAY_RE.test(input.paidDate)) blocking.push("Den úhrady musí být RRRR-MM-DD.");
    else if (input.paidDate > today) blocking.push("Den úhrady nesmí být v budoucnosti.");
    else if (input.paidDate !== s.paidDate) {
      changes.push(`Úhrada: ${s.paidDate ? `uhrazeno ${czDay(s.paidDate)}` : "neuhrazeno"} → uhrazeno ${czDay(input.paidDate)} (na PDF „Uhrazeno – neplaťte“)`);
      s.paidDate = input.paidDate;
    }
  }
  if (input.note !== undefined && input.note !== null) {
    const note = input.note.trim() || null;
    if (note && note.length > 500) blocking.push("Poznámka může mít nejvýš 500 znaků.");
    else if (note !== s.note) {
      changes.push(note ? `Poznámka: „${note}“` : "Poznámka: smazat");
      s.note = note;
    }
  }
  blocking.push(...snapshotProblems(s));
  return { snapshot: s, changes, blocking };
}

function fingerprintOf(doc: OwnDocumentRow, input: OwnChangeInput): string {
  return createHash("sha256")
    .update(JSON.stringify({ id: doc.id, version: doc.version, state: doc.state, sent: doc.sent_at, input }))
    .digest("hex");
}

/** Náhled změny — jen čtení. */
export async function prepareOwnChange(db: Db, input: OwnChangeInput, today: string): Promise<OwnChangePreview | null> {
  const doc = await loadOwnDocument(db, input.number);
  if (!doc) return null;
  const s = doc.snapshot;
  const blocking: string[] = [];
  const warnings: string[] = [];
  let changes: string[] = [];
  let newSnapshot: OwnInvoiceSnapshot | null = null;
  if (doc.state === "cancelled") blocking.push(`Faktura ${doc.number} je stornovaná — nejde měnit.`);
  if (input.action === "edit") {
    const r = applyEdit(s, input, today);
    changes = r.changes;
    blocking.push(...r.blocking);
    newSnapshot = r.snapshot;
    if (changes.length === 0) blocking.push("Žádná změna — faktura by zůstala stejná.");
    if (doc.sent_at) warnings.push("Zákazník už má původní verzi — po úpravě mu pošli novou (send_idoklad_invoice_email).");
    if (doc.order_id && newSnapshot.totalKc !== s.totalKc) warnings.push("Faktura patří k objednávce — nová částka se liší od objednávky.");
  } else if (input.action === "cancel") {
    if (!input.reason?.trim()) blocking.push("Uveďte důvod storna.");
    changes = [`Stornovat fakturu ${doc.number} (${formatKc(s.totalKc)}) — číslo zůstane, faktura se nepočítá do příjmů.`];
    if (doc.order_id) warnings.push("K objednávce pak půjde vystavit novou fakturu (nové číslo).");
    if (doc.sent_at) warnings.push("Zákazník fakturu dostal — dej mu vědět, že je stornovaná.");
  } else {
    if (doc.sent_at) blocking.push(`Fakturu ${doc.number} už zákazník dostal — nelze ji smazat, jen stornovat.`);
    const later = (await db.execute(sql`SELECT 1 FROM own_invoice_documents WHERE left(number, 4) = left(${doc.number}::text, 4) AND number > ${doc.number}::text LIMIT 1`)).rows[0];
    if (later) blocking.push(`Smazat lze jen poslední fakturu v řadě — ${doc.number} jde jen stornovat.`);
    changes = [`Smazat fakturu ${doc.number} úplně — číslo se uvolní pro další fakturu.`];
  }
  return {
    document: {
      number: doc.number,
      state: doc.state,
      customer: s.customer.name,
      totalKc: s.totalKc,
      paid: Boolean(s.paidDate),
      paymentMethod: METHOD_LABEL[s.paymentMethod as OwnChangeMethod] ?? s.paymentMethod,
      sentToCustomer: Boolean(doc.sent_at),
      orderId: doc.order_id,
      version: doc.version,
    },
    action: input.action,
    changes,
    blocking,
    warnings,
    fingerprint: fingerprintOf(doc, input),
    newSnapshot,
  };
}

export type OwnChangeResult =
  | { ok: true; number: string; action: OwnChangeInput["action"]; version: number | null; changes: string[] }
  | { ok: false; error: string };

export async function applyOwnChange(db: Db, input: OwnChangeInput, options: { expectedFingerprint: string; actorName: string; today: string }): Promise<OwnChangeResult> {
  const p = await prepareOwnChange(db, input, options.today);
  if (!p) return { ok: false, error: `Faktura ${input.number} v MojeBegina není.` };
  if (p.fingerprint !== options.expectedFingerprint) return { ok: false, error: "Faktura se od náhledu změnila. Nic se neprovedlo — připravte změnu znovu." };
  if (p.blocking.length) return { ok: false, error: `${p.blocking.join(" ")} Nic se neprovedlo.` };
  const doc = (await loadOwnDocument(db, input.number))!;
  try {
    if (input.action === "edit") {
      const r = await updateOwnDocument(db, doc.id, p.newSnapshot!, options.actorName);
      return { ok: true, number: r.number, action: "edit", version: r.version, changes: p.changes };
    }
    if (input.action === "cancel") {
      await cancelOwnDocument(db, doc.id, input.reason!.trim(), options.actorName);
      return { ok: true, number: doc.number, action: "cancel", version: null, changes: p.changes };
    }
    await deleteOwnDocument(db, doc.id);
    return { ok: true, number: doc.number, action: "delete", version: null, changes: p.changes };
  } catch (error) {
    return { ok: false, error: `${error instanceof OwnIssueError ? error.message : error instanceof Error ? error.message : String(error)} Nic se neprovedlo.` };
  }
}
