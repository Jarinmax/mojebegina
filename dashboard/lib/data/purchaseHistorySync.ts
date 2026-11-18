// Načtení vydaných faktur z iDokladu (jen čtení) pro historii nákupů kontaktů
// v CRM — viz purchaseHistory.ts. Zatím jen zkušební spárování (počty), nic
// se neukládá.
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { EshopIdokladClient, issuedInvoiceFilter, sinceDayFilter } from "@/lib/eshop/invoicing/idokladHttp";
import { eshopIdokladCredentials } from "@/lib/eshop/invoicing/mode";
import { assertBeginaAgenda, type RawInvoice } from "@/lib/idoklad-read/service";
import { matchPurchaseHistory, type HistoryInvoice, type HistoryLead, type PurchaseHistory } from "./purchaseHistory";

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

export async function loadIdokladInvoices(env: Env = process.env, fetchImpl?: typeof fetch): Promise<HistoryLoad> {
  const credentials = eshopIdokladCredentials(env);
  if (!credentials) return { status: "not_configured" };
  const client = new EshopIdokladClient({ ...credentials, writesAllowed: false, env, fetchImpl, requestBudget: HISTORY_MAX_PAGES + 30 });
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
