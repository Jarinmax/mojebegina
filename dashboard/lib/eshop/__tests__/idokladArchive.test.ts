// Archiv iDokladu: seznam + PDF po dávkách, bez zdvojení, změna → nové PDF.
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createMigratedDb } from "./helpers/migratedDb";
import { idokladArchiveStatus, importIdokladArchive } from "../invoicing/idokladArchive";

const ENV = { IDOKLAD_ESHOP_CLIENT_ID: "cid", IDOKLAD_ESHOP_CLIENT_SECRET: "csecret", IDOKLAD_ESHOP_APPLICATION_ID: "capp" };
const PDF = Buffer.from("%PDF-1.4 " + "x".repeat(200)).toString("base64");

function invoice(id: number, number: string, day: string, changed = "2026-10-01T10:00:00") {
  return {
    Id: id,
    DocumentNumber: number,
    VariableSymbol: number,
    DateOfIssue: `${day}T00:00:00`,
    DateOfMaturity: `${day}T00:00:00`,
    DateOfPayment: `${day}T00:00:00`,
    PaymentStatus: 1,
    PartnerAddress: { NickName: `Odběratel ${id}`, IdentificationNumber: id % 2 ? "12345679" : null, Email: "a@b.cz" },
    Prices: { TotalWithVat: 100 + id, TotalPaid: 100 + id },
    Items: [{ Name: "Dýňová polévka", Amount: 1 }],
    Metadata: { DateLastChange: changed },
  };
}

describe("archiv iDokladu (PGlite)", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let invoices = Array.from({ length: 150 }, (_, i) => invoice(i + 1, `2026${String(i + 1).padStart(4, "0")}`, `2026-0${1 + (i % 9)}-15`));
  const pdfCalls: string[] = [];
  const writes: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const ok = (data: unknown) => new Response(JSON.stringify({ Data: data, IsSuccess: true, StatusCode: 200 }), { status: 200 });
    if (url.hostname === "identity.idoklad.cz") return new Response(JSON.stringify({ access_token: "tok-test-0123456789", expires_in: 3600 }), { status: 200 });
    if (method !== "GET") writes.push(`${method} ${url.pathname}`);
    const path = url.pathname.replace(/^\/v3/, "");
    if (path === "/Account/CurrentAgenda") return ok({ Contact: { IdentificationNumber: "74337297" }, IsRegisteredForVat: false });
    if (path === "/IssuedInvoices") {
      const page = Number(url.searchParams.get("page"));
      const size = Number(url.searchParams.get("pageSize"));
      return ok({ Items: invoices.slice((page - 1) * size, page * size), TotalItems: invoices.length, TotalPages: Math.ceil(invoices.length / size) });
    }
    if (path === "/CreditNotes") return new Response(JSON.stringify({ IsSuccess: false, StatusCode: 403, Message: "Nedostupné" }), { status: 403 });
    const pdf = /^\/Reports\/IssuedInvoice\/(\d+)\/Pdf$/.exec(path);
    if (pdf) {
      pdfCalls.push(pdf[1]);
      return ok(PDF);
    }
    return new Response(JSON.stringify({ IsSuccess: false, StatusCode: 404, Message: path }), { status: 404 });
  }) as typeof fetch;

  beforeAll(async () => {
    ({ db } = await createMigratedDb());
  });

  it("první běh: celý seznam, PDF jen dávka; dobropisy nedostupné nevadí; do iDokladu se nic nezapisuje", async () => {
    const run = await importIdokladArchive(db, { env: ENV, fetchImpl, pdfLimit: 40 });
    expect(run).toMatchObject({ status: "done", listed: { invoice: 150, credit_note: 0 }, pdfFetched: 40, total: 150, pdfMissing: 110 });
    expect(run.listErrors).toHaveLength(1);
    expect(writes).toEqual([]);
    const [row] = (await db.execute(sql`SELECT number, payment, total_kc, partner_ico, pdf_filename FROM idoklad_archive WHERE idoklad_id = 1`)).rows;
    expect(row).toMatchObject({ number: "20260001", payment: "paid", partner_ico: "12345679" });
  });

  it("další běhy dotáhnou zbytek bez zdvojení; změněný doklad dostane nové PDF", async () => {
    await importIdokladArchive(db, { env: ENV, fetchImpl, pdfLimit: 100 });
    const done = await importIdokladArchive(db, { env: ENV, fetchImpl, pdfLimit: 100 });
    expect(done).toMatchObject({ total: 150, pdfMissing: 0, pdfFetched: 10 });
    pdfCalls.length = 0;
    invoices = invoices.map((i) => (i.Id === 7 ? invoice(7, "20260007", "2026-07-15", "2026-11-20T08:00:00") : i));
    const again = await importIdokladArchive(db, { env: ENV, fetchImpl, pdfLimit: 100 });
    expect(again).toMatchObject({ total: 150, pdfFetched: 1, pdfMissing: 0 });
    expect(pdfCalls).toEqual(["7"]);
    expect(await idokladArchiveStatus(db)).toMatchObject({ total: 150, withPdf: 150, invoices: 150, creditNotes: 0 });
  });
});
