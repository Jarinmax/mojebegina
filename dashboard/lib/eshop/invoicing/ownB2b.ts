// Ruční faktura (mimo e-shop) ve vlastní řadě MojeBegina — náhrada B2B
// fakturace přes iDoklad (Lucie 23. 11. 2026). Stejné vstupy i postup jako
// dřív (prepare → potvrzení → issue se stejným otiskem), jen bez iDokladu:
// odběratel = karta zákazníka v MojeBegina podle IČO, číslo z jediné řady.
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { ownInvoicingGate } from "./mode";
import { addDays, b2bWarnings, B2B_PAYMENT_LABELS, type B2bInvoiceInput } from "./b2bInvoiceValidation";
import { ownSupplier, type OwnInvoiceSnapshot } from "./ownInvoice";
import { issueOwnDocument, ownDocumentPdf } from "./ownIssue";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export const OWN_B2B_DUPLICATE_DAYS = 7;

export const ownInvoicePdfPath = (number: string) => `/rizeni-firmy/faktury/vlastni/${number}/pdf`;

export type OwnB2bCustomer = {
  organizationId: string;
  cardName: string;
  name: string;
  ico: string;
  dic: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  email: string | null;
};

export type OwnB2bSimilar = { number: string; totalKc: number; issueDate: string };

export type OwnB2bPreview = {
  value: B2bInvoiceInput;
  canIssueLive: boolean;
  liveReason: string | null;
  expectedNumber: string | null;
  customer: OwnB2bCustomer | null;
  paymentLabel: string;
  similar: OwnB2bSimilar[];
  blocking: string[];
  warnings: string[];
  fingerprint: string;
};

function splitAddress(raw: string | null): { street: string | null; zip: string | null; city: string | null } {
  if (!raw) return { street: null, zip: null, city: null };
  const m = /^(.*?),\s*(\d{3})\s?(\d{2})\s+(.+)$/.exec(raw.trim());
  return m ? { street: m[1].trim(), zip: `${m[2]} ${m[3]}`, city: m[4].trim() } : { street: raw.trim(), zip: null, city: null };
}

async function findCustomer(db: Db, ico: string): Promise<OwnB2bCustomer | null> {
  const org = (
    await db.execute(sql`
      SELECT id, name, COALESCE(NULLIF(btrim(billing_name), ''), name) AS billing_name, registered_address, dic
      FROM organizations WHERE ico = ${ico} LIMIT 1`)
  ).rows[0] as { id: string; name: string; billing_name: string; registered_address: string | null; dic: string | null } | undefined;
  if (!org) return null;
  const rows = (await db.execute(sql`
    SELECT email FROM (
      SELECT contact_email AS email, ordered_at AS at, 0 AS pref FROM orders
       WHERE buyer_organization_id = ${org.id} AND fulfillment_status <> 'cancelled'
      UNION ALL
      SELECT contact_email, updated_at, 1 FROM leads WHERE converted_organization_id = ${org.id}
    ) c ORDER BY pref, at DESC`)).rows as { email: string | null }[];
  const email = rows.map((r) => r.email?.trim().toLowerCase() ?? "").find((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) ?? null;
  return { organizationId: org.id, cardName: org.name, name: org.billing_name, ico, dic: org.dic, ...splitAddress(org.registered_address), email };
}

async function nextNumber(db: Db, year: number): Promise<string | null> {
  const row = (await db.execute(sql`SELECT last_serial FROM invoice_number_counters WHERE year = ${year}`)).rows[0] as { last_serial: number } | undefined;
  const serial = (row?.last_serial ?? (year > 2026 ? 0 : -1)) + 1;
  return serial > 0 ? `${year}${String(serial).padStart(4, "0")}` : null;
}

function fingerprintOf(value: B2bInvoiceInput, customer: OwnB2bCustomer | null): string {
  return createHash("sha256").update(JSON.stringify({ value, customer, provider: "begina" })).digest("hex");
}

export function b2bSnapshot(value: B2bInvoiceInput, customer: OwnB2bCustomer, env: Env = process.env): OwnInvoiceSnapshot {
  return {
    version: 1,
    kind: "invoice",
    correctsNumber: null,
    issueDate: value.issueDate,
    dueDate: value.dueDate,
    paidDate: value.paid ? value.issueDate : null,
    paymentMethod: value.paymentMethod,
    vs: null, // VS = číslo faktury (doplní se při vykreslení)
    orderReference: value.orderNumber,
    supplier: ownSupplier(env),
    customer: {
      kind: "company",
      name: customer.name,
      contactPerson: customer.cardName !== customer.name ? customer.cardName : null,
      street: customer.street,
      city: customer.city,
      zip: customer.zip,
      country: "Česká republika",
      ico: customer.ico,
      dic: customer.dic,
      email: customer.email,
    },
    delivery: null,
    lines: value.items.map((i) => ({
      name: i.unit && i.unit !== "ks" ? `${i.name} (${i.unit})` : i.name,
      quantity: i.quantity,
      unitPriceKc: i.unitPriceKc,
      totalKc: i.totalKc,
    })),
    totalKc: value.totalKc,
    note: [value.description, value.note].filter((t) => t && t.trim()).join("\n") || null,
  };
}

/** Náhled ruční faktury — jen čtení. */
export async function prepareOwnB2bInvoice(db: Db, value: B2bInvoiceInput, env: Env = process.env): Promise<OwnB2bPreview> {
  const gate = ownInvoicingGate(env);
  const blocking: string[] = [];
  const customer = await findCustomer(db, value.ico);
  if (!customer) blocking.push(`Odběratel s IČO ${value.ico} není v MojeBegina. Založte ho jako zákazníka (karta s IČO a sídlem) a připravte fakturu znovu.`);
  else if (!customer.street || !customer.city) blocking.push(`Zákazník ${customer.cardName} nemá v MojeBegina sídlo (ulice, PSČ, obec) — doplňte ho na kartě zákazníka.`);
  const year = Number(value.issueDate.slice(0, 4));
  const expectedNumber = await nextNumber(db, year).catch(() => null);
  if (!expectedNumber) blocking.push("Číselná řada faktur není založená.");
  const from = addDays(value.issueDate, -OWN_B2B_DUPLICATE_DAYS);
  const to = addDays(value.issueDate, OWN_B2B_DUPLICATE_DAYS);
  const similar = (
    await db.execute(sql`
      SELECT number, total_kc, issue_date::text AS issue_date FROM own_invoice_documents
      WHERE customer_ico = ${value.ico} AND total_kc = ${value.totalKc} AND state = 'issued'
        AND issue_date BETWEEN ${from}::date AND ${to}::date`)
  ).rows.map((r) => ({ number: String(r.number), totalKc: Number(r.total_kc), issueDate: String(r.issue_date) }));
  const warnings = b2bWarnings(value);
  if (similar.length) {
    warnings.push(`Možná duplicita: odběratel má ve ±${OWN_B2B_DUPLICATE_DAYS} dnech fakturu se stejnou částkou (${similar.map((s) => s.number).join(", ")}). Vystavit lze jen s confirm_not_duplicate=true.`);
  }
  return {
    value,
    canIssueLive: gate.open,
    liveReason: gate.open ? null : gate.reason,
    expectedNumber,
    customer,
    paymentLabel: B2B_PAYMENT_LABELS[value.paymentMethod],
    similar,
    blocking,
    warnings,
    fingerprint: fingerprintOf(value, customer),
  };
}

export type OwnB2bIssueResult =
  | { ok: true; invoiceNumber: string; documentId: string; totalKc: number; paid: boolean; dueDate: string; partnerName: string; warnings?: string[] }
  | { ok: false; error: string; existing?: OwnB2bSimilar[] };

export async function issueOwnB2bInvoice(
  db: Db,
  value: B2bInvoiceInput,
  options: { expectedFingerprint: string; confirmNotDuplicate: boolean; actor: { userId: string; name: string }; via: Record<string, unknown> },
  env: Env = process.env
): Promise<OwnB2bIssueResult> {
  const preview = await prepareOwnB2bInvoice(db, value, env);
  if (preview.fingerprint !== options.expectedFingerprint) {
    return { ok: false, error: "Údaje faktury nebo odběratele se od náhledu změnily. Nic se nevystavilo — připravte fakturu znovu." };
  }
  if (!preview.canIssueLive) return { ok: false, error: preview.liveReason ?? "Vystavování je vypnuté." };
  if (preview.blocking.length || !preview.customer) return { ok: false, error: `${preview.blocking.join(" ")} Nic se nevystavilo.` };
  if (preview.similar.length && !options.confirmNotDuplicate) {
    return { ok: false, error: "Odběratel má podobnou fakturu (stejná částka, ±7 dní). Vystavit lze jen s confirm_not_duplicate=true po výslovném potvrzení uživatele.", existing: preview.similar };
  }
  let doc: { id: string; number: string };
  try {
    doc = await issueOwnDocument(db, { snapshot: b2bSnapshot(value, preview.customer, env), actorName: options.actor.name });
  } catch (error) {
    return { ok: false, error: `${error instanceof Error ? error.message : String(error)} Nic se nevystavilo.` };
  }
  const warnings: string[] = [];
  await ownDocumentPdf(db, doc.id).catch(() => warnings.push("PDF se uloží při prvním otevření."));
  try {
    await db.execute(sql`
      INSERT INTO organization_activity (organization_id, author_user_id, author_name, kind, metadata)
      VALUES (${preview.customer.organizationId}, ${options.actor.userId}, ${options.actor.name}, 'invoice_issued',
              ${JSON.stringify({ ...options.via, invoiceNumber: doc.number, provider: "begina", totalKc: value.totalKc, paid: value.paid, paymentMethod: value.paymentMethod, dueDate: value.dueDate })}::jsonb)`);
  } catch {
    warnings.push("Faktura vznikla, jen se nezapsala do historie zákazníka v MojeBegina.");
  }
  const result = { ok: true as const, invoiceNumber: doc.number, documentId: doc.id, totalKc: value.totalKc, paid: value.paid, dueDate: value.dueDate, partnerName: preview.customer.name };
  return warnings.length ? { ...result, warnings } : result;
}
