// Vlastní fakturace — vystavení dokladu v MojeBegina (bez iDokladu).
//
// Číslo se přiděluje a doklad ukládá JEDNÍM SQL příkazem (počítadlo +
// own_invoice_documents + faktura objednávky + historie): buď vznikne
// všechno, nebo nic — v řadě nevznikne díra ani dvojí číslo. PDF se vykreslí
// ze snímku hned potom; když se uložení PDF nepovede, vykreslí se ze
// snímku kdykoli znovu (snímek je to, co je na faktuře — nemění se).
//
// Brána: jen Production (VERCEL_ENV) + přepínač IDOKLAD_INVOICING_ENABLED
// „manual“/„on“ (stejný jako dřív) + založené počítadlo roku 2026
// (produkční SQL od Lucie = potvrzení posledního čísla z iDokladu).

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/lib/db/schema";
import { ownInvoicingGate } from "./mode";
import { loadDraftInputs, buildDraftPayload, prepareInvoiceDraft, activitySql, type InvoiceActor } from "./service";
import { blockingProblems } from "./draft";
import {
  ownInvoiceFilename,
  renderOwnInvoicePdf,
  snapshotFromDraft,
  snapshotProblems,
  type OwnInvoiceSnapshot,
} from "./ownInvoice";

type Db = NeonHttpDatabase<typeof schema>;
type Env = Record<string, string | undefined>;

export { ownInvoicingActive, ownInvoicingGate } from "./mode";

/** Rok, od kterého řada běží; jeho počítadlo se zakládá ručně (navázání na iDoklad). */
export const OWN_SERIES_FIRST_YEAR = 2026;

export type OwnPdf = { filename: string; contentBase64: string; invoiceNumber: string };

export type OwnIssueInput = {
  snapshot: OwnInvoiceSnapshot;
  actorName: string;
  /** e-shopová faktura objednávky (invoices.id, stav draft) */
  invoiceId?: string | null;
  orderId?: string | null;
  correctsDocumentId?: string | null;
  /** zápis do historie objednávky */
  activity?: { orderId: string; actor: InvoiceActor };
};

export class OwnIssueError extends Error {}

/** Přidělí číslo a uloží doklad (atomicky). Vrací id a číslo. */
export async function issueOwnDocument(db: Db, input: OwnIssueInput): Promise<{ id: string; number: string }> {
  const s = input.snapshot;
  const problems = snapshotProblems(s);
  if (problems.length > 0) throw new OwnIssueError(problems.join(" "));
  const year = Number(s.issueDate.slice(0, 4));
  if (year > OWN_SERIES_FIRST_YEAR) {
    await db.execute(sql`INSERT INTO invoice_number_counters (year, last_serial) VALUES (${year}, 0) ON CONFLICT (year) DO NOTHING`);
  }
  const invoiceId = input.invoiceId ?? null;
  const act = input.activity ?? null;
  const rows = (
    await db.execute(sql`
      WITH n AS (
        UPDATE invoice_number_counters SET last_serial = last_serial + 1, updated_at = now()
        WHERE year = ${year}::int AND last_serial < 9999
          AND (${invoiceId}::uuid IS NULL OR EXISTS (
            SELECT 1 FROM invoices WHERE id = ${invoiceId}::uuid AND doc_state = 'draft'))
        RETURNING year, last_serial
      ), doc AS (
        INSERT INTO own_invoice_documents
          (number, kind, invoice_id, order_id, corrects_document_id, issue_date, total_kc, customer_name, customer_ico, snapshot, issued_by_name)
        SELECT n.year::text || lpad(n.last_serial::text, 4, '0'), ${s.kind}::text, ${invoiceId}::uuid, ${input.orderId ?? null}::uuid,
               ${input.correctsDocumentId ?? null}::uuid, ${s.issueDate}::date, ${s.totalKc}::int, ${s.customer.name}::text, ${s.customer.ico}::text,
               ${JSON.stringify(s)}::jsonb, ${input.actorName}::text
        FROM n
        RETURNING id, number
      ), inv AS (
        UPDATE invoices SET doc_state = 'issued', invoice_number = (SELECT number FROM doc), issued_at = now(),
               paid_at = CASE WHEN ${s.paidDate}::date IS NULL THEN paid_at ELSE now() END, updated_at = now()
        WHERE ${invoiceId}::uuid IS NOT NULL AND id = ${invoiceId}::uuid AND doc_state = 'draft' AND EXISTS (SELECT 1 FROM doc)
        RETURNING id
      ), lnk AS (
        UPDATE invoice_provider_links SET state = 'void', last_error = 'Vystaveno v MojeBegina (vlastní fakturace)', updated_at = now()
        WHERE invoice_id IN (SELECT id FROM inv) AND state IN ('dry_run', 'pending', 'failed')
        RETURNING id
      ), act AS (
        INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
        SELECT ${act?.orderId ?? null}::uuid, ${act?.actor.type ?? "system"}::text, ${act && act.actor.type === "user" ? act.actor.userId : null}::text,
               ${act?.actor.name ?? input.actorName}::text, 'invoice_issued',
               jsonb_build_object('invoiceNumber', doc.number, 'provider', 'begina', 'kind', ${s.kind}::text)
        FROM doc WHERE ${act?.orderId ?? null}::uuid IS NOT NULL
        RETURNING id
      )
      SELECT doc.id, doc.number, (SELECT count(*) FROM inv)::int AS inv_count FROM doc`)
  ).rows as { id: string; number: string; inv_count: number }[];
  const row = rows[0];
  if (!row) {
    if (year === OWN_SERIES_FIRST_YEAR) {
      const counter = (await db.execute(sql`SELECT last_serial FROM invoice_number_counters WHERE year = ${year}`)).rows[0];
      if (!counter) throw new OwnIssueError("Číselná řada 2026 ještě není založená (produkční SQL s posledním číslem z iDokladu).");
    }
    throw new OwnIssueError(invoiceId ? "Faktura objednávky už není návrh (vystavená jinde) — nic se nevystavilo." : "Číslo faktury se nepodařilo přidělit.");
  }
  if (invoiceId && row.inv_count !== 1) throw new OwnIssueError(`Doklad ${row.number} vznikl, ale faktura objednávky se neoznačila — zkontrolovat.`);
  return { id: row.id, number: row.number };
}

/**
 * PDF dokladu — vždy vykreslené z aktuálního snímku (obsah faktury je snímek;
 * PDF je jen jeho podoba, takže se úpravy vzhledu projeví i u starších).
 * Uložené pdf_base64 = archivní kopie z prvního vykreslení.
 */
export async function ownDocumentPdf(db: Db, documentId: string): Promise<OwnPdf | null> {
  const row = (
    await db.execute(sql`SELECT number, kind, snapshot, pdf_base64 FROM own_invoice_documents WHERE id = ${documentId}`)
  ).rows[0] as { number: string; kind: OwnInvoiceSnapshot["kind"]; snapshot: OwnInvoiceSnapshot; pdf_base64: string | null } | undefined;
  if (!row) return null;
  const bytes = await renderOwnInvoicePdf(row.snapshot, row.number);
  const base64 = Buffer.from(bytes).toString("base64");
  if (!row.pdf_base64) {
    const sha = createHash("sha256").update(bytes).digest("hex");
    await db
      .execute(sql`UPDATE own_invoice_documents SET pdf_base64 = ${base64}, pdf_sha256 = ${sha} WHERE id = ${documentId} AND pdf_base64 IS NULL`)
      .catch((error) => console.error("Fakturace: PDF dokladu se nepodařilo uložit", row.number, error));
  }
  return { filename: ownInvoiceFilename(row.number, row.kind), contentBase64: base64, invoiceNumber: row.number };
}

export type OwnEshopIssueResult =
  | { status: "issued"; invoiceNumber: string; externalId: null; adopted: boolean; pdf: OwnPdf | null }
  | { status: "already_issued"; invoiceNumber: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string; externalId: null };

/**
 * Faktura k uhrazené e-shopové objednávce — vlastní řada místo iDokladu.
 * Volá ji issue.ts (issueInvoice), takže automatika po zaplacení / expedici
 * i ruční „Vystavit fakturu“ zůstávají stejné.
 */
export async function issueOwnEshopInvoice(
  db: Db,
  orderId: string,
  deps: { env?: Env; actor?: InvoiceActor; reallyPaid: (db: Db, orderId: string) => Promise<string | null> }
): Promise<OwnEshopIssueResult> {
  const env = deps.env ?? process.env;
  const actor = deps.actor ?? { type: "system", name: "Fakturace" };
  const gate = ownInvoicingGate(env);
  if (!gate.open) return { status: "skipped", reason: gate.reason };

  const issued = (
    await db.execute(sql`
      SELECT invoice_number FROM invoices
      WHERE order_id = ${orderId} AND document_type = 'invoice' AND doc_state = 'issued'`)
  ).rows[0] as { invoice_number: string } | undefined;
  if (issued) return { status: "already_issued", invoiceNumber: issued.invoice_number };

  const unpaid = await deps.reallyPaid(db, orderId);
  if (unpaid) return { status: "skipped", reason: unpaid.replace("do iDokladu ", "") };

  try {
    await prepareInvoiceDraft(db, orderId, { actor }, env);
    const draftRow = (
      await db.execute(sql`
        SELECT id FROM invoices WHERE order_id = ${orderId} AND document_type = 'invoice' AND doc_state = 'draft'
        ORDER BY created_at DESC LIMIT 1`)
    ).rows[0] as { id: string } | undefined;
    if (!draftRow) return { status: "failed", error: "Návrh faktury k objednávce chybí.", externalId: null };

    const inputs = await loadDraftInputs(db, orderId);
    if (!inputs) return { status: "failed", error: "Objednávka nebyla nalezena.", externalId: null };
    const { draft, problems } = buildDraftPayload(inputs, env);
    const blocking = blockingProblems(problems, "dry_run");
    if (blocking.length > 0) return { status: "failed", error: blocking.map((p) => p.message).join(" "), externalId: null };

    const snapshot = snapshotFromDraft(draft, env);
    const doc = await issueOwnDocument(db, {
      snapshot,
      actorName: actor.name,
      invoiceId: draftRow.id,
      orderId,
      activity: { orderId, actor },
    });
    let pdf: OwnPdf | null = null;
    try {
      pdf = await ownDocumentPdf(db, doc.id);
    } catch (error) {
      console.error("Fakturace: PDF vlastní faktury se nepodařilo vykreslit", doc.number, error);
    }
    return { status: "issued", invoiceNumber: doc.number, externalId: null, adopted: false, pdf };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 400) : String(error);
    console.error("Fakturace: vlastní vystavení selhalo", orderId, message);
    await db.execute(activitySql(orderId, actor, "invoice_issue_failed", { error: message, provider: "begina" })).catch(() => undefined);
    return { status: "failed", error: message, externalId: null };
  }
}

/** PDF vlastní faktury objednávky (dodatečné odeslání e-mailem). */
export async function loadOwnOrderPdf(db: Db, orderId: string): Promise<OwnPdf | null> {
  const row = (
    await db.execute(sql`
      SELECT d.id FROM own_invoice_documents d
      WHERE d.order_id = ${orderId} AND d.kind = 'invoice' ORDER BY d.created_at DESC LIMIT 1`)
  ).rows[0] as { id: string } | undefined;
  return row ? ownDocumentPdf(db, row.id) : null;
}

// ------------------------------------------------ úprava, storno, smazání
// Neplátce DPH (Lucie 23. 11. 2026): fakturu lze upravit (stejné číslo, nová
// verze PDF; předchozí verzi uloží trigger do own_invoice_versions),
// stornovat (číslo zůstane, faktura se nepočítá) a smazat jen poslední
// neodeslanou (číslo se uvolní, řada zůstane bez díry).

export type OwnDocumentRow = {
  id: string;
  number: string;
  state: "issued" | "cancelled";
  version: number;
  sent_at: string | null;
  invoice_id: string | null;
  order_id: string | null;
  snapshot: OwnInvoiceSnapshot;
};

export async function loadOwnDocument(db: Db, idOrNumber: string): Promise<OwnDocumentRow | null> {
  const byNumber = /^\d{8}$/.test(idOrNumber);
  const row = (
    await db.execute(sql`
      SELECT id, number, state, version, sent_at, invoice_id, order_id, snapshot FROM own_invoice_documents
      WHERE ${byNumber ? sql`number = ${idOrNumber}` : sql`id = ${idOrNumber}::uuid`}`)
  ).rows[0] as OwnDocumentRow | undefined;
  return row ?? null;
}

/** Úprava obsahu faktury (číslo zůstává). Vrací novou verzi. */
export async function updateOwnDocument(db: Db, id: string, snapshot: OwnInvoiceSnapshot, actorName: string): Promise<{ number: string; version: number }> {
  const problems = snapshotProblems(snapshot);
  if (problems.length > 0) throw new OwnIssueError(problems.join(" "));
  const rows = (
    await db.execute(sql`
      WITH d AS (
        UPDATE own_invoice_documents SET snapshot = ${JSON.stringify(snapshot)}::jsonb, total_kc = ${snapshot.totalKc}::int,
               customer_name = ${snapshot.customer.name}::text, customer_ico = ${snapshot.customer.ico}::text,
               issue_date = ${snapshot.issueDate}::date, paid_on = ${snapshot.paidDate}::date, updated_by_name = ${actorName}::text
        WHERE id = ${id}::uuid AND state = 'issued'
        RETURNING number, version, invoice_id
      ), i AS (
        UPDATE invoices SET total_kc = ${snapshot.totalKc}::int, updated_at = now()
        WHERE id IN (SELECT invoice_id FROM d) RETURNING id
      )
      SELECT number, version FROM d`)
  ).rows as { number: string; version: number }[];
  if (!rows[0]) throw new OwnIssueError("Faktura nebyla nalezena nebo je stornovaná.");
  await ownDocumentPdf(db, id).catch(() => null); // nové PDF
  return rows[0];
}

/** Storno: číslo zůstane, faktura se nepočítá; e-shopová faktura objednávky se zneplatní (lze vystavit novou). */
export async function cancelOwnDocument(db: Db, id: string, reason: string, actorName: string): Promise<{ number: string }> {
  const rows = (
    await db.execute(sql`
      WITH d AS (
        UPDATE own_invoice_documents SET state = 'cancelled', cancelled_at = now(), cancel_reason = ${reason.slice(0, 300)}::text,
               updated_by_name = ${actorName}::text
        WHERE id = ${id}::uuid AND state = 'issued'
        RETURNING number, invoice_id, order_id
      ), i AS (
        UPDATE invoices SET doc_state = 'void', updated_at = now() WHERE id IN (SELECT invoice_id FROM d) RETURNING id
      ), a AS (
        INSERT INTO order_activity (order_id, actor_type, author_user_id, author_name, kind, metadata)
        SELECT order_id, 'system', NULL, ${actorName}::text, 'invoice_cancelled', jsonb_build_object('invoiceNumber', number, 'reason', ${reason.slice(0, 300)}::text)
        FROM d WHERE order_id IS NOT NULL RETURNING id
      )
      SELECT number FROM d`)
  ).rows as { number: string }[];
  if (!rows[0]) throw new OwnIssueError("Faktura nebyla nalezena nebo už je stornovaná.");
  return rows[0];
}

/** Smazání — jen poslední faktura v řadě, která ještě neodešla zákazníkovi; číslo se uvolní. */
export async function deleteOwnDocument(db: Db, id: string): Promise<{ number: string }> {
  const doc = await loadOwnDocument(db, id);
  if (!doc) throw new OwnIssueError("Faktura nebyla nalezena.");
  if (doc.sent_at) throw new OwnIssueError(`Fakturu ${doc.number} už zákazník dostal — nelze ji smazat, jen stornovat.`);
  const later = (
    await db.execute(sql`SELECT 1 FROM own_invoice_documents WHERE left(number, 4) = left(${doc.number}::text, 4) AND number > ${doc.number}::text LIMIT 1`)
  ).rows[0];
  if (later) throw new OwnIssueError(`Smazat lze jen poslední fakturu v řadě — ${doc.number} stornujte.`);
  const rows = (
    await db.execute(sql`
      WITH del AS (
        DELETE FROM own_invoice_documents WHERE id = ${id}::uuid RETURNING number, invoice_id
      ), c AS (
        UPDATE invoice_number_counters SET last_serial = last_serial - 1, updated_at = now()
        FROM del WHERE year = left(del.number, 4)::int AND last_serial = right(del.number, 4)::int
        RETURNING year
      ), i AS (
        UPDATE invoices SET doc_state = 'draft', invoice_number = NULL, issued_at = NULL, paid_at = NULL, updated_at = now()
        FROM del WHERE invoices.id = del.invoice_id RETURNING invoices.id
      )
      SELECT number, (SELECT count(*) FROM c)::int AS freed FROM del`)
  ).rows as { number: string; freed: number }[];
  if (!rows[0]) throw new OwnIssueError("Fakturu se nepodařilo smazat.");
  return { number: rows[0].number };
}

/** Faktura odešla odběrateli (první odeslání se zapamatuje — pak už nejde smazat). */
export async function markOwnDocumentSent(db: Db, id: string): Promise<void> {
  await db.execute(sql`UPDATE own_invoice_documents SET sent_at = COALESCE(sent_at, now()) WHERE id = ${id}::uuid`);
}
