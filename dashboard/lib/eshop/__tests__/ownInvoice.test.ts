// Vlastní fakturace (Lucie 23. 11. 2026): jedna řada RRRRNNNN v MojeBegina.
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { createMigratedDb } from "./helpers/migratedDb";
import { formatKc, ownInvoiceNumber, ownSupplier, renderOwnInvoicePdf, snapshotProblems, type OwnInvoiceSnapshot } from "../invoicing/ownInvoice";
import { cancelOwnDocument, deleteOwnDocument, issueOwnDocument, ownDocumentPdf, ownInvoicingGate, updateOwnDocument } from "../invoicing/ownIssue";
import { invoicingMode } from "../invoicing/mode";

function snapshot(extra: Partial<OwnInvoiceSnapshot> = {}): OwnInvoiceSnapshot {
  return {
    version: 1,
    kind: "invoice",
    correctsNumber: null,
    issueDate: "2026-11-23",
    dueDate: "2026-11-23",
    paidDate: "2026-11-20",
    paymentMethod: "bank_transfer",
    vs: "70000021",
    orderReference: "70000021",
    supplier: ownSupplier({ ESHOP_BANK_ACCOUNT: "123/0100" }),
    customer: { kind: "company", name: "ČAJ RUM BUM", contactPerson: "Tomáš Stančík", street: "Kostelní 76", city: "Jindřichův Hradec", zip: "370 01", country: "Česká republika", ico: "76442535", dic: "CZ8305301235", email: "a@b.cz" },
    delivery: null,
    lines: [
      { name: "Dýňová polévka – 3 l", quantity: 1, unitPriceKc: 379, totalKc: 379 },
      { name: "Chlazená přeprava", quantity: 1, unitPriceKc: 267, totalKc: 267 },
    ],
    totalKc: 646,
    note: null,
    ...extra,
  };
}

describe("vlastní faktura — čisté funkce", () => {
  it("číslo: rok + 4 číslice", () => {
    expect(ownInvoiceNumber(2026, 215)).toBe("20260215");
    expect(ownInvoiceNumber(2027, 1)).toBe("20270001");
    expect(() => ownInvoiceNumber(2026, 0)).toThrow();
    expect(() => ownInvoiceNumber(2026, 10000)).toThrow();
  });
  it("částky", () => {
    expect(formatKc(1025)).toBe("1 025 Kč");
    expect(formatKc(-379)).toBe("−379 Kč");
    expect(formatKc(31.8)).toBe("31,80 Kč");
  });
  it("kontrola snímku", () => {
    expect(snapshotProblems(snapshot())).toEqual([]);
    expect(snapshotProblems(snapshot({ totalKc: 700 })).join()).toContain("nesedí");
    expect(snapshotProblems(snapshot({ dueDate: "2026-11-01" })).join()).toContain("Splatnost");
    expect(snapshotProblems(snapshot({ kind: "credit_note" })).join()).toContain("Dobropis");
  });
  it("PDF: jedna stránka, náležitosti v metadatech", async () => {
    const bytes = await renderOwnInvoicePdf(snapshot({ paidDate: null }), "20260215");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Faktura 20260215 – Begina");
  });
  it("brána: jen Production a přepínač manual/on; INVOICING_PROVIDER=idoklad = stará cesta", () => {
    expect(ownInvoicingGate({ VERCEL_ENV: "preview", IDOKLAD_INVOICING_ENABLED: "on" }).open).toBe(false);
    expect(ownInvoicingGate({ VERCEL_ENV: "production" }).open).toBe(false);
    expect(ownInvoicingGate({ VERCEL_ENV: "production", IDOKLAD_INVOICING_ENABLED: "manual" })).toEqual({ open: true, trigger: "manual" });
    expect(invoicingMode({ VERCEL_ENV: "production", IDOKLAD_INVOICING_ENABLED: "on" })).toMatchObject({ mode: "live", automatic: true });
    expect(ownInvoicingGate({ VERCEL_ENV: "production", IDOKLAD_INVOICING_ENABLED: "on", INVOICING_PROVIDER: "idoklad" }).open).toBe(false);
  });
});

describe("vlastní faktura — číslování a uložení (PGlite)", () => {
  it("bez založené řady 2026 se nic nevystaví; po založení navazuje 20260215, 20260216", async () => {
    const { db } = await createMigratedDb();
    await expect(issueOwnDocument(db as never, { snapshot: snapshot(), actorName: "Test" })).rejects.toThrow("není založená");
    await db.execute(sql`INSERT INTO invoice_number_counters (year, last_serial) VALUES (2026, 214)`);
    const a = await issueOwnDocument(db as never, { snapshot: snapshot(), actorName: "Test" });
    const b = await issueOwnDocument(db as never, { snapshot: snapshot(), actorName: "Test" });
    expect([a.number, b.number]).toEqual(["20260215", "20260216"]);
    const pdf = await ownDocumentPdf(db as never, a.id);
    expect(pdf?.filename).toBe("Faktura-20260215.pdf");
    expect(Buffer.from(pdf!.contentBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
  });

  it("nový rok začíná od 0001 sám", async () => {
    const { db } = await createMigratedDb();
    await db.execute(sql`INSERT INTO invoice_number_counters (year, last_serial) VALUES (2026, 300)`);
    const doc = await issueOwnDocument(db as never, { snapshot: snapshot({ issueDate: "2027-01-02", dueDate: "2027-01-02" }), actorName: "Test" });
    expect(doc.number).toBe("20270001");
  });

  it("vadný snímek: číslo se nepřidělí (žádná díra v řadě)", async () => {
    const { db } = await createMigratedDb();
    await db.execute(sql`INSERT INTO invoice_number_counters (year, last_serial) VALUES (2026, 214)`);
    await expect(issueOwnDocument(db as never, { snapshot: snapshot({ totalKc: 1 }), actorName: "Test" })).rejects.toThrow();
    const row = (await db.execute(sql`SELECT last_serial FROM invoice_number_counters WHERE year = 2026`)).rows[0] as { last_serial: number };
    expect(row.last_serial).toBe(214);
  });

  it("úprava: stejné číslo, nová verze, stará verze uložená, nové PDF", async () => {
    const { db } = await createMigratedDb();
    await db.execute(sql`INSERT INTO invoice_number_counters (year, last_serial) VALUES (2026, 214)`);
    const doc = await issueOwnDocument(db as never, { snapshot: snapshot(), actorName: "Test" });
    await ownDocumentPdf(db as never, doc.id);
    const changed = snapshot({ lines: [{ name: "Dýňová polévka – 3 l", quantity: 2, unitPriceKc: 379, totalKc: 758 }], totalKc: 758 });
    const r = await updateOwnDocument(db as never, doc.id, changed, "Lucie");
    expect(r).toEqual({ number: "20260215", version: 2 });
    const versions = (await db.execute(sql`SELECT version, total_kc FROM own_invoice_versions WHERE document_id = ${doc.id}`)).rows;
    expect(versions).toEqual([{ version: 1, total_kc: 646 }]);
    const row = (await db.execute(sql`SELECT total_kc, pdf_base64 IS NOT NULL AS has_pdf FROM own_invoice_documents WHERE id = ${doc.id}`)).rows[0];
    expect(row).toEqual({ total_kc: 758, has_pdf: true });
    await expect(db.execute(sql`UPDATE own_invoice_documents SET number = '20260999' WHERE id = ${doc.id}`)).rejects.toThrow();
  });

  it("smazat jde jen poslední neodeslanou (číslo se uvolní); jinak storno", async () => {
    const { db } = await createMigratedDb();
    await db.execute(sql`INSERT INTO invoice_number_counters (year, last_serial) VALUES (2026, 214)`);
    const a = await issueOwnDocument(db as never, { snapshot: snapshot(), actorName: "Test" });
    const b = await issueOwnDocument(db as never, { snapshot: snapshot(), actorName: "Test" });
    await expect(deleteOwnDocument(db as never, a.id)).rejects.toThrow("poslední");
    expect((await deleteOwnDocument(db as never, b.id)).number).toBe("20260216");
    const again = await issueOwnDocument(db as never, { snapshot: snapshot(), actorName: "Test" });
    expect(again.number).toBe("20260216");
    await db.execute(sql`UPDATE own_invoice_documents SET sent_at = now() WHERE id = ${again.id}`);
    await expect(deleteOwnDocument(db as never, again.id)).rejects.toThrow("stornovat");
    expect((await cancelOwnDocument(db as never, a.id, "Zákazník si to rozmyslel", "Lucie")).number).toBe("20260215");
    const st = (await db.execute(sql`SELECT state FROM own_invoice_documents WHERE id = ${a.id}`)).rows[0];
    expect(st).toEqual({ state: "cancelled" });
  });
});

describe("IBAN z čísla účtu", () => {
  it("česká čísla účtů → platný IBAN", async () => {
    const { czIbanFromAccount } = await import("../invoicing/ownInvoice");
    expect(czIbanFromAccount("19-2000145399/0800")).toBe("CZ6508000000192000145399");
    expect(czIbanFromAccount("2000145399/0800")).toBe("CZ7908000000002000145399");
    expect(czIbanFromAccount("nesmysl")).toBeNull();
  });
});
