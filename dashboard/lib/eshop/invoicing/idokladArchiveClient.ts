// Čtení „iDokladu“ z archivu v MojeBegina (Lucie 23. 11. 2026): předplatné
// iDokladu končí 4. 12. 2026. Klient má stejné čtecí metody jako
// EshopIdokladClient (get / list / requestCount / log), takže všechna
// stávající čtení (přehledy, PDF, historie nákupů, asistent) fungují dál —
// jen data jdou z tabulky idoklad_archive (idokladArchive.ts), ne z API.
// Zápis neumí (archiv je jen ke čtení).
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { EshopIdokladClient, IdokladApiError, type IdokladListPage, type IdokladLogEntry } from "./idokladHttp";
import { BEGINA_ICO, eshopIdokladCredentials, ownInvoicingActive } from "./mode";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;
type Raw = Record<string, unknown> & { Id: number; DocumentNumber?: string | null; DateOfIssue?: string | null; PartnerId?: number | null; NumericSequenceId?: number | null };

/** Číst z archivu? Ano, jakmile MojeBegina vystavuje faktury sama (iDoklad je jen archiv). */
export function idokladArchiveMode(env: Env = process.env): boolean {
  return ownInvoicingActive(env) || env.IDOKLAD_SOURCE === "archive";
}

type Cond = { field: string; op: string; value: string };

/** „((A~eq~1)~and~(B~gte~2026-01-01))“ → podmínky (jen „and“, jak je skládá MojeBegina). */
export function parseFilter(filter: string | undefined): Cond[] {
  if (!filter) return [];
  if (/~or~/.test(filter)) throw new IdokladApiError("Archiv iDokladu neumí filtr „or“.");
  return [...filter.matchAll(/([A-Za-z]+)~(eq|gte|lte|gt|lt|ct|!eq)~([^()~]*)/g)].map((m) => ({ field: m[1], op: m[2], value: m[3] }));
}

function fieldValue(raw: Raw, field: string): string | null {
  if (field === "IdentificationNumber") return ((raw.PartnerAddress as Record<string, unknown> | undefined)?.IdentificationNumber as string | undefined)?.replace(/\s/g, "") ?? null;
  if (field === "NickName") return ((raw.PartnerAddress as Record<string, unknown> | undefined)?.NickName as string | undefined) ?? null;
  if (field === "IsPaid") return String(String(raw.PaymentStatus) === "1" || raw.PaymentStatus === "Paid");
  const v = raw[field];
  if (v === null || v === undefined) return null;
  return String(v);
}

function matches(raw: Raw, conds: Cond[]): boolean {
  return conds.every((c) => {
    const actual = fieldValue(raw, c.field);
    if (actual === null) return c.op === "!eq";
    const isDate = /^Date/.test(c.field);
    const a = isDate ? actual.slice(0, 10) : actual;
    const b = isDate ? c.value.slice(0, 10) : c.value;
    const num = !isDate && /^-?\d+(\.\d+)?$/.test(a) && /^-?\d+(\.\d+)?$/.test(b);
    const cmp = num ? Number(a) - Number(b) : a < b ? -1 : a > b ? 1 : 0;
    switch (c.op) {
      case "eq": return cmp === 0;
      case "!eq": return cmp !== 0;
      case "gte": return cmp >= 0;
      case "lte": return cmp <= 0;
      case "gt": return cmp > 0;
      case "lt": return cmp < 0;
      case "ct": return a.toLocaleLowerCase("cs").includes(b.toLocaleLowerCase("cs"));
      default: return false;
    }
  });
}

/** Řady odvozené z čísel v archivu (iDoklad je už neposkytuje). */
function seriesOf(raws: Raw[]) {
  const seen = new Map<number, { Id: number; Name: string; DocumentType: number; IsDefault: boolean; NumberFormat: string }>();
  for (const r of raws) {
    const id = Number(r.NumericSequenceId);
    if (!Number.isFinite(id) || seen.has(id)) continue;
    const eshop = /^9\d{6}$/.test(r.DocumentNumber ?? "");
    seen.set(id, { Id: id, Name: eshop ? "E-shop Begina" : "Výchozí", DocumentType: 0, IsDefault: !eshop, NumberFormat: eshop ? "9{RR}{NNNN}" : "{RRRR}{NNNN}" });
  }
  return [...seen.values()];
}

export class IdokladArchiveClient {
  readonly log: IdokladLogEntry[] = [];
  private count = 0;
  private cache: Raw[] | null = null;

  constructor(private readonly db: Db) {}

  get requestCount(): number {
    return this.count;
  }

  private async all(): Promise<Raw[]> {
    if (!this.cache) {
      const rows = (await this.db.execute(sql`SELECT raw FROM idoklad_archive WHERE doc_kind = 'invoice' ORDER BY issue_date DESC NULLS LAST, number DESC`)).rows as { raw: Raw }[];
      this.cache = rows.map((r) => r.raw);
    }
    return this.cache;
  }

  async list<T>(path: string, filter?: string, pageSize = 100, page = 1): Promise<IdokladListPage<T>> {
    this.count += 1;
    const conds = parseFilter(filter);
    let items: unknown[];
    if (path === "/IssuedInvoices") {
      items = (await this.all()).filter((r) => matches(r, conds));
    } else if (path === "/Contacts") {
      const byId = new Map<number, Record<string, unknown>>();
      for (const r of await this.all()) {
        const id = Number(r.PartnerId);
        if (!Number.isFinite(id) || byId.has(id)) continue;
        const a = (r.PartnerAddress ?? {}) as Record<string, unknown>;
        byId.set(id, {
          Id: id,
          IdentificationNumber: (a.IdentificationNumber as string | undefined)?.replace(/\s/g, "") ?? null,
          CompanyName: (a.NickName as string | undefined) ?? null,
          Email: (a.Email as string | undefined) ?? null,
          Phone: null,
          Mobile: null,
        });
      }
      items = [...byId.values()].filter((c) => conds.every((x) => x.op === "eq" && String(c[x.field] ?? "") === x.value));
    } else if (path === "/NumericSequences") {
      items = seriesOf(await this.all());
    } else if (path === "/CreditNotes") {
      items = ((await this.db.execute(sql`SELECT raw FROM idoklad_archive WHERE doc_kind = 'credit_note' ORDER BY issue_date DESC`)).rows as { raw: Raw }[]).map((r) => r.raw);
    } else {
      throw new IdokladApiError(`Archiv iDokladu: ${path} není k dispozici (iDoklad už se nepoužívá).`);
    }
    const start = (page - 1) * pageSize;
    return { Items: items.slice(start, start + pageSize) as T[], TotalItems: items.length, TotalPages: Math.max(1, Math.ceil(items.length / pageSize)) };
  }

  async get<T>(path: string): Promise<T> {
    this.count += 1;
    if (path === "/Account/CurrentAgenda") return { Contact: { IdentificationNumber: BEGINA_ICO }, IsRegisteredForVat: false, PreferredPriceType: 0 } as T;
    const detail = /^\/IssuedInvoices\/(\d+)$/.exec(path);
    if (detail) {
      const row = (await this.db.execute(sql`SELECT raw FROM idoklad_archive WHERE doc_kind = 'invoice' AND idoklad_id = ${Number(detail[1])}`)).rows[0] as { raw: Raw } | undefined;
      if (!row) throw new IdokladApiError(`Faktura ${detail[1]} v archivu iDokladu není.`, 404);
      return row.raw as T;
    }
    const pdf = /^\/Reports\/(IssuedInvoice|CreditNote)\/(\d+)\/Pdf$/.exec(path);
    if (pdf) {
      const kind = pdf[1] === "CreditNote" ? "credit_note" : "invoice";
      const row = (await this.db.execute(sql`SELECT pdf_base64 FROM idoklad_archive WHERE doc_kind = ${kind} AND idoklad_id = ${Number(pdf[2])}`)).rows[0] as { pdf_base64: string | null } | undefined;
      if (!row?.pdf_base64) throw new IdokladApiError(`PDF dokladu ${pdf[2]} v archivu iDokladu není.`, 404);
      return row.pdf_base64 as T;
    }
    throw new IdokladApiError(`Archiv iDokladu: ${path} není k dispozici (iDoklad už se nepoužívá).`);
  }
}

/**
 * Čtecí klient iDokladu: archiv (vlastní fakturace) nebo živé API (stará
 * cesta). Vrací null, když živé API nemá přístupové údaje.
 */
export function idokladReadClient(
  db: Db,
  options: { env?: Env; fetchImpl?: typeof fetch; requestBudget?: number } = {}
): EshopIdokladClient | null {
  const env = options.env ?? process.env;
  if (idokladArchiveMode(env)) return new IdokladArchiveClient(db) as unknown as EshopIdokladClient;
  const credentials = eshopIdokladCredentials(env);
  return credentials ? new EshopIdokladClient({ ...credentials, writesAllowed: false, env, fetchImpl: options.fetchImpl, requestBudget: options.requestBudget }) : null;
}

/** Výchozí databáze MojeBegina (jen na serveru; testy předávají vlastní). */
export async function defaultDb(): Promise<Db> {
  return (await import("@/lib/db/client")).db as unknown as Db;
}

/** Úhrada staré faktury (karta v zákaznickém účtu) — zapíše se do archivu místo do iDokladu. */
export async function markArchiveInvoicePaid(db: Db, idokladId: number, day: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    UPDATE idoklad_archive SET payment = 'paid', paid_date = ${day}::date, paid_kc = total_kc,
           raw = jsonb_set(jsonb_set(jsonb_set(raw, '{PaymentStatus}', '1'::jsonb), '{DateOfPayment}', to_jsonb(${`${day}T00:00:00`}::text)),
                           '{Prices,TotalPaid}', to_jsonb(total_kc)),
           updated_at = now()
    WHERE doc_kind = 'invoice' AND idoklad_id = ${idokladId} AND payment <> 'paid'
    RETURNING idoklad_id`)).rows;
  return rows.length > 0;
}

/** Jako idokladReadClient, ale databázi načte jen v režimu archivu (stará cesta ji nepotřebuje). */
export async function idokladReadClientLazy(options: { db?: Db; env?: Env; fetchImpl?: typeof fetch; requestBudget?: number } = {}): Promise<EshopIdokladClient | null> {
  const env = options.env ?? process.env;
  const db = idokladArchiveMode(env) ? (options.db ?? (await defaultDb())) : (null as unknown as Db);
  return idokladReadClient(db, options);
}
