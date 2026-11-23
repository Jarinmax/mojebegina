// Načtení vydaných faktur z iDokladu (jen čtení) pro historii nákupů kontaktů
// v CRM — viz purchaseHistory.ts. syncPurchaseHistory uloží výsledek do
// lead_purchase_history (noční běh); summarizeTrial jen spočítá počty.
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { issuedInvoiceFilter, sinceDayFilter } from "@/lib/eshop/invoicing/idokladHttp";
import { idokladReadClientLazy } from "@/lib/eshop/invoicing/idokladArchiveClient";
import type { OwnInvoiceSnapshot } from "@/lib/eshop/invoicing/ownInvoice";
import { assertBeginaAgenda, type RawInvoice } from "@/lib/idoklad-read/service";
import { isCurrentProduct, matchPurchaseHistory, type HistoryInvoice, type HistoryLead, type PurchaseHistory, type PurchasedItem } from "./purchaseHistory";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export const HISTORY_SINCE = "2019-01-01";
export const HISTORY_MAX_PAGES = 60;

type RawContact = { Id: number; Email?: string | null; Mobile?: string | null; Phone?: string | null };
export type ContactInfo = { email: string | null; phone: string | null };

export function toHistoryInvoice(raw: RawInvoice, contacts?: Map<number, ContactInfo>): HistoryInvoice {
  const contact = raw.PartnerId != null ? contacts?.get(raw.PartnerId) : undefined;
  const a = raw.PartnerAddress ?? {};
  const person = [a.Firstname, a.Surname].filter(Boolean).join(" ").trim();
  return {
    number: raw.DocumentNumber ?? String(raw.Id),
    day: raw.DateOfIssue ? raw.DateOfIssue.slice(0, 10) : null,
    totalKc: raw.Prices?.TotalWithVat ?? null,
    email: a.Email?.trim() || contact?.email || null,
    phone: contact?.phone ?? null,
    name: a.NickName?.trim() || person || null,
    ico: a.IdentificationNumber?.replace(/\s/g, "") || null,
    items: (raw.Items ?? []).map((i) => ({ name: i.Name ?? "", quantity: Number(i.Amount ?? 0) })),
  };
}

export type HistoryLoad =
  | { status: "not_configured" }
  | { status: "ok"; invoices: HistoryInvoice[]; pages: number; truncated: boolean; total: number };

export async function loadIdokladInvoices(env: Env = process.env, fetchImpl?: typeof fetch, database?: Db): Promise<HistoryLoad> {
  const client = await idokladReadClientLazy({ db: database, env, fetchImpl, requestBudget: HISTORY_MAX_PAGES + 30 });
  if (!client) return { status: "not_configured" };
  await assertBeginaAgenda(client);
  // adresář: e-mail a telefon odběratele (starší faktury je na sobě nemají)
  const contacts = new Map<number, ContactInfo>();
  let contactPage = 1;
  let contactPages = 1;
  do {
    const got = await client.list<RawContact>("/Contacts", undefined, 100, contactPage);
    contactPages = got.TotalPages;
    for (const c of got.Items) contacts.set(c.Id, { email: c.Email?.trim() || null, phone: c.Mobile?.trim() || c.Phone?.trim() || null });
    contactPage += 1;
  } while (contactPage <= contactPages && contactPage <= 20);
  const filter = issuedInvoiceFilter(sinceDayFilter("DateOfIssue", HISTORY_SINCE));
  const invoices: HistoryInvoice[] = [];
  let page = 1;
  let totalPages = 1;
  let total = 0;
  do {
    const got = await client.list<RawInvoice>("/IssuedInvoices", filter, 100, page);
    totalPages = got.TotalPages;
    total = got.TotalItems;
    invoices.push(...got.Items.map((raw) => toHistoryInvoice(raw, contacts)));
    page += 1;
  } while (page <= totalPages && page <= HISTORY_MAX_PAGES);
  return { status: "ok", invoices, pages: page - 1, truncated: totalPages > HISTORY_MAX_PAGES, total };
}

/** Faktury vystavené v MojeBegina (od 20260215) — do historie nákupů stejně jako starší z iDokladu. */
export async function withOwnInvoices(db: Db, load: Extract<HistoryLoad, { status: "ok" }>): Promise<Extract<HistoryLoad, { status: "ok" }>> {
  const rows = (await db.execute(sql`SELECT number, issue_date::text AS day, snapshot FROM own_invoice_documents WHERE state = 'issued' AND kind = 'invoice'`)).rows as { number: string; day: string; snapshot: OwnInvoiceSnapshot }[];
  const known = new Set(load.invoices.map((i) => i.number));
  const own: HistoryInvoice[] = rows
    .filter((r) => !known.has(r.number))
    .map((r) => ({
      number: r.number,
      day: r.day,
      totalKc: r.snapshot.totalKc,
      email: r.snapshot.customer.email,
      phone: null,
      name: r.snapshot.customer.name,
      ico: r.snapshot.customer.ico,
      items: r.snapshot.lines.filter((l) => l.totalKc > 0).map((l) => ({ name: l.name, quantity: l.quantity })),
    }));
  return { ...load, invoices: [...load.invoices, ...own], total: load.total + own.length };
}

export async function loadHistoryLeads(db: Db): Promise<HistoryLead[]> {
  const rows = (await db.execute(sql`SELECT id, coalesce(company_name, contact_name) AS name, contact_email AS email, contact_phone AS phone FROM leads`)).rows as { id: string; name: string | null; email: string | null; phone: string | null }[];
  return rows;
}

export type HistoryTrial = {
  invoicesRead: number;
  invoicesTotal: number;
  truncated: boolean;
  invoicesWithItems: number;
  invoicesWithEmail: number;
  invoiceYears: Record<string, number>;
  leads: number;
  matched: number;
  matchedByEmail: number;
  matchedByPhone: number;
  matchedByName: number;
  invoicesWithPhone: number;
  /** kolik různých odběratelů (e-mail / telefon / jméno) v iDokladu vůbec je */
  distinctPartners: number;
  /** ukázka bez jmen a e-mailů — jen co a kolik */
  examples: { matchedBy: string; invoices: number; lastDay: string | null; totalKc: number; items: string[] }[];
};

export function summarizeTrial(leads: HistoryLead[], load: Extract<HistoryLoad, { status: "ok" }>): HistoryTrial {
  const matched: Map<string, PurchaseHistory> = matchPurchaseHistory(leads, load.invoices);
  const values = [...matched.values()];
  const invoiceYears: Record<string, number> = {};
  for (const i of load.invoices) {
    const year = i.day?.slice(0, 4) ?? "bez data";
    invoiceYears[year] = (invoiceYears[year] ?? 0) + 1;
  }
  return {
    invoicesRead: load.invoices.length,
    invoicesTotal: load.total,
    truncated: load.truncated,
    invoicesWithItems: load.invoices.filter((i) => i.items.length > 0).length,
    invoicesWithEmail: load.invoices.filter((i) => i.email).length,
    invoiceYears,
    leads: leads.length,
    matched: values.length,
    matchedByEmail: values.filter((v) => v.matchedBy === "email").length,
    matchedByPhone: values.filter((v) => v.matchedBy === "phone").length,
    matchedByName: values.filter((v) => v.matchedBy === "name").length,
    invoicesWithPhone: load.invoices.filter((i) => i.phone).length,
    distinctPartners: new Set(load.invoices.map((i) => (i.email ?? i.phone ?? i.name ?? i.number).toLowerCase())).size,
    examples: values
      .sort((a, b) => b.invoices - a.invoices)
      .slice(0, 8)
      .map((v) => ({ matchedBy: v.matchedBy, invoices: v.invoices, lastDay: v.lastDay, totalKc: v.totalKc, items: v.items.slice(0, 8).map((i) => `${i.quantity}× ${i.name}`) })),
  };
}

export type StoredPurchaseHistory = {
  matchedBy: "email" | "phone" | "name";
  invoices: number;
  totalKc: number;
  firstDay: string | null;
  lastDay: string | null;
  items: PurchasedItem[];
  syncedAt: string;
};

export type SyncResult = { status: "not_configured" } | { status: "ok"; invoices: number; leads: number; matched: number; removed: number };

/**
 * Noční běh: načte faktury, spáruje s kontakty a přepíše lead_purchase_history
 * (kontakty, které už shodu nemají, se odstraní). Když iDoklad selže, výjimka
 * projde ven a tabulka zůstane, jak byla.
 */
export async function syncPurchaseHistory(db: Db, options: { env?: Env; fetchImpl?: typeof fetch; load?: HistoryLoad } = {}): Promise<SyncResult> {
  const base = options.load ?? (await loadIdokladInvoices(options.env, options.fetchImpl, db));
  const load = base.status === "ok" ? await withOwnInvoices(db, base) : base;
  if (load.status !== "ok") return { status: "not_configured" };
  if (load.truncated) throw new Error("Faktur je víc, než se načte — historie se neuložila.");
  const leads = await loadHistoryLeads(db);
  const products = ((await db.execute(sql`SELECT name FROM products`)).rows as { name: string }[]).map((r) => r.name);
  const matched = matchPurchaseHistory(leads, load.invoices);
  const started = new Date();
  for (const [leadId, h] of matched) {
    const items = h.items.map((i) => ({ ...i, current: isCurrentProduct(i.name, products) }));
    await db.execute(sql`
      INSERT INTO lead_purchase_history (lead_id, matched_by, invoices, total_kc, first_day, last_day, items, synced_at)
      VALUES (${leadId}::uuid, ${h.matchedBy}, ${h.invoices}, ${h.totalKc}, ${h.firstDay}::date, ${h.lastDay}::date, ${JSON.stringify(items)}::jsonb, now())
      ON CONFLICT (lead_id) DO UPDATE SET matched_by = EXCLUDED.matched_by, invoices = EXCLUDED.invoices, total_kc = EXCLUDED.total_kc,
        first_day = EXCLUDED.first_day, last_day = EXCLUDED.last_day, items = EXCLUDED.items, synced_at = now()`);
  }
  const removed = await db.execute(sql`DELETE FROM lead_purchase_history WHERE synced_at < ${started.toISOString()}::timestamptz RETURNING lead_id`);
  return { status: "ok", invoices: load.invoices.length, leads: leads.length, matched: matched.size, removed: removed.rows.length };
}

/** Historie jednoho kontaktu; null = v iDokladu žádná faktura (nebo tabulka ještě není založená / naplněná). */
export async function getLeadPurchaseHistory(db: Db, leadId: string): Promise<{ history: StoredPurchaseHistory | null; lastSync: string | null }> {
  try {
    const rows = (
      await db.execute(sql`
        SELECT h.matched_by, h.invoices, h.total_kc, h.first_day::text AS first_day, h.last_day::text AS last_day, h.items, h.synced_at,
               (SELECT max(synced_at) FROM lead_purchase_history) AS last_sync
        FROM (SELECT 1) one LEFT JOIN lead_purchase_history h ON h.lead_id = ${leadId}::uuid`)
    ).rows as { matched_by: string | null; invoices: number | null; total_kc: string | null; first_day: string | null; last_day: string | null; items: PurchasedItem[] | null; synced_at: string | Date | null; last_sync: string | Date | null }[];
    const row = rows[0];
    const lastSync = row?.last_sync ? new Date(row.last_sync).toISOString() : null;
    if (!row || row.matched_by === null) return { history: null, lastSync };
    return {
      lastSync,
      history: {
        matchedBy: row.matched_by as StoredPurchaseHistory["matchedBy"],
        invoices: Number(row.invoices),
        totalKc: Number(row.total_kc),
        firstDay: row.first_day,
        lastDay: row.last_day,
        items: row.items ?? [],
        syncedAt: new Date(row.synced_at ?? Date.now()).toISOString(),
      },
    };
  } catch (error) {
    // tabulka na dané větvi ještě není — kontakt se zobrazí bez historie
    console.error("Historie nákupů: nepodařilo se načíst", error instanceof Error ? error.message.slice(0, 160) : error);
    return { history: null, lastSync: null };
  }
}
