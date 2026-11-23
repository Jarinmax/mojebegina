// Archiv iDokladu (Lucie 23. 11. 2026): předplatné iDokladu končí 4. 12. 2026
// a tarif Zdarma nemá API. Všechny vydané faktury (a dobropisy) se proto
// i s PDF zkopírují do tabulky idoklad_archive. Do iDokladu se jen čte.
// Běží po dávkách (seznam vždy celý, PDF nejvýš `pdfLimit` na běh), opakovaný
// běh nic nezdvojí; změněný doklad v iDokladu (DateLastChange) se přepíše
// a jeho PDF se stáhne znovu.
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { EshopIdokladClient } from "./idokladHttp";
import { eshopIdokladCredentials } from "./mode";
import { assertBeginaAgenda, summarize, type RawInvoice } from "@/lib/idoklad-read/service";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export const ARCHIVE_MAX_PAGES = 20; // 20 × 100 dokladů na druh
export const ARCHIVE_PDF_LIMIT = 40;

type Kind = "invoice" | "credit_note";
const SOURCES: { kind: Kind; list: string; pdf: (id: number) => string }[] = [
  { kind: "invoice", list: "/IssuedInvoices", pdf: (id) => `/Reports/IssuedInvoice/${id}/Pdf` },
  { kind: "credit_note", list: "/CreditNotes", pdf: (id) => `/Reports/CreditNote/${id}/Pdf` },
];

export type ArchiveRun = {
  status: "not_configured" | "done";
  listed: Record<Kind, number>;
  upserted: number;
  pdfFetched: number;
  pdfFailed: { number: string; error: string }[];
  pdfMissing: number;
  total: number;
  listErrors: string[];
};

function archiveRow(kind: Kind, raw: RawInvoice) {
  const s = summarize(raw, null, "2100-01-01");
  const email = raw.PartnerAddress?.Email?.trim().toLowerCase() || null;
  return {
    kind,
    id: raw.Id,
    number: s.number || String(raw.Id),
    issue: s.dateOfIssue,
    due: s.dateOfMaturity,
    paid: s.dateOfPayment,
    payment: s.payment,
    total: s.totalKc,
    paidKc: s.paidKc,
    vs: s.variableSymbol,
    partnerName: s.partner.name,
    partnerIco: s.partner.ico,
    partnerEmail: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    raw,
  };
}

export async function importIdokladArchive(db: Db, deps: { env?: Env; fetchImpl?: typeof fetch; pdfLimit?: number } = {}): Promise<ArchiveRun> {
  const env = deps.env ?? process.env;
  const pdfLimit = Math.max(0, Math.min(deps.pdfLimit ?? ARCHIVE_PDF_LIMIT, 100));
  const result: ArchiveRun = { status: "done", listed: { invoice: 0, credit_note: 0 }, upserted: 0, pdfFetched: 0, pdfFailed: [], pdfMissing: 0, total: 0, listErrors: [] };
  const credentials = eshopIdokladCredentials(env);
  if (!credentials) return { ...result, status: "not_configured" };
  const client = new EshopIdokladClient({ ...credentials, writesAllowed: false, env, fetchImpl: deps.fetchImpl, requestBudget: ARCHIVE_MAX_PAGES * 2 + pdfLimit + 10 });
  await assertBeginaAgenda(client);

  for (const source of SOURCES) {
    let page = 1;
    let pages = 1;
    try {
      do {
        const got = await client.list<RawInvoice>(source.list, undefined, 100, page);
        pages = got.TotalPages;
        for (const raw of got.Items) {
          const r = archiveRow(source.kind, raw);
          result.listed[source.kind] += 1;
          const changed = raw.Metadata?.DateLastChange ?? null;
          await db.execute(sql`
            INSERT INTO idoklad_archive (doc_kind, idoklad_id, number, issue_date, due_date, paid_date, payment, total_kc, paid_kc,
                                         variable_symbol, partner_name, partner_ico, partner_email, raw)
            VALUES (${r.kind}, ${r.id}, ${r.number}, ${r.issue}::date, ${r.due}::date, ${r.paid}::date, ${r.payment}, ${r.total}::numeric, ${r.paidKc}::numeric,
                    ${r.vs}, ${r.partnerName}, ${r.partnerIco}, ${r.partnerEmail}, ${JSON.stringify(r.raw)}::jsonb)
            ON CONFLICT (doc_kind, idoklad_id) DO UPDATE SET
              number = EXCLUDED.number, issue_date = EXCLUDED.issue_date, due_date = EXCLUDED.due_date, paid_date = EXCLUDED.paid_date,
              payment = EXCLUDED.payment, total_kc = EXCLUDED.total_kc, paid_kc = EXCLUDED.paid_kc, variable_symbol = EXCLUDED.variable_symbol,
              partner_name = EXCLUDED.partner_name, partner_ico = EXCLUDED.partner_ico, partner_email = EXCLUDED.partner_email, raw = EXCLUDED.raw,
              pdf_base64 = CASE WHEN idoklad_archive.raw->'Metadata'->>'DateLastChange' IS DISTINCT FROM ${changed}::text THEN NULL ELSE idoklad_archive.pdf_base64 END,
              updated_at = now()`);
          result.upserted += 1;
        }
        page += 1;
      } while (page <= pages && page <= ARCHIVE_MAX_PAGES);
    } catch (error) {
      // dobropisy nemusí být v agendě vůbec — chyba seznamu nesmí zastavit faktury
      result.listErrors.push(`${source.list}: ${error instanceof Error ? error.message.slice(0, 200) : "neznámá chyba"}`);
    }
  }

  const missing = (await db.execute(sql`
    SELECT doc_kind, idoklad_id, number FROM idoklad_archive WHERE pdf_base64 IS NULL
    ORDER BY issue_date DESC NULLS LAST LIMIT ${pdfLimit}`)).rows as { doc_kind: Kind; idoklad_id: number; number: string }[];
  for (const row of missing) {
    const source = SOURCES.find((s) => s.kind === row.doc_kind)!;
    try {
      const base64 = await client.get<string>(source.pdf(Number(row.idoklad_id)));
      if (typeof base64 !== "string" || base64.length < 100) throw new Error("iDoklad nevrátil PDF");
      const filename = `${row.doc_kind === "credit_note" ? "dobropis" : "faktura"}-${row.number.replace(/[^0-9A-Za-z-]/g, "") || row.idoklad_id}.pdf`;
      await db.execute(sql`
        UPDATE idoklad_archive SET pdf_base64 = ${base64}, pdf_filename = ${filename}, pdf_fetched_at = now(), updated_at = now()
        WHERE doc_kind = ${row.doc_kind} AND idoklad_id = ${row.idoklad_id}`);
      result.pdfFetched += 1;
    } catch (error) {
      result.pdfFailed.push({ number: row.number, error: error instanceof Error ? error.message.slice(0, 160) : "neznámá chyba" });
      if (error instanceof Error && /limit požadavků/.test(error.message)) break;
    }
  }
  const counts = (await db.execute(sql`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE pdf_base64 IS NULL)::int AS missing FROM idoklad_archive`)).rows[0] as { total: number; missing: number };
  result.total = counts.total;
  result.pdfMissing = counts.missing;
  return result;
}

/** Stav archivu (bez osobních údajů) — pro kontrolu, že je kompletní. */
export async function idokladArchiveStatus(db: Db): Promise<{ total: number; withPdf: number; invoices: number; creditNotes: number; firstDay: string | null; lastDay: string | null; lastNumber: string | null }> {
  return (await db.execute(sql`
    SELECT count(*)::int AS total, count(pdf_base64)::int AS "withPdf",
           count(*) FILTER (WHERE doc_kind = 'invoice')::int AS invoices, count(*) FILTER (WHERE doc_kind = 'credit_note')::int AS "creditNotes",
           min(issue_date)::text AS "firstDay", max(issue_date)::text AS "lastDay",
           (SELECT number FROM idoklad_archive WHERE doc_kind = 'invoice' ORDER BY issue_date DESC NULLS LAST, number DESC LIMIT 1) AS "lastNumber"
    FROM idoklad_archive`)).rows[0] as never;
}
