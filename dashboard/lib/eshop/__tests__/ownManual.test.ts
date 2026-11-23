// Ruční objednávka: faktura (i nezaplacená s QR) odchází s „Odesláno“ (Lucie 23. 11. 2026).
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createMigratedDb } from "./helpers/migratedDb";
import { manualInvoiceEmail, sendManualOrderInvoiceOnDispatch } from "../invoicing/ownManual";
import type { EmailMessage } from "../email/resend";

const ENV = { VERCEL_ENV: "production", IDOKLAD_INVOICING_ENABLED: "manual", ESHOP_BANK_ACCOUNT: "123/0100" };
const ORG = "f1111111-1111-4111-8111-111111111111";
const UNPAID = "f2222222-2222-4222-8222-222222222222";
const PAID = "f3333333-3333-4333-8333-333333333333";
const NOMAIL = "f4444444-4444-4444-8444-444444444444";

describe("ruční objednávka: faktura při Odesláno (PGlite)", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  const mails: EmailMessage[] = [];
  const mailer = {
    config: { apiKey: "re_x", from: "Begina <objednavky@begina.cz>", replyTo: null, internalTo: ["info@begina.cz"], invoiceCopyTo: ["info@begina.cz"], testRecipients: null },
    transport: async (m: EmailMessage) => (mails.push(m), { ok: true as const, id: "m" }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const send = (orderId: string) => sendManualOrderInvoiceOnDispatch(db, orderId, { env: ENV, mailer: mailer as any, today: "2026-11-24" });

  beforeAll(async () => {
    ({ db } = await createMigratedDb());
    await db.execute(sql`INSERT INTO invoice_number_counters (year, last_serial) VALUES (2026, 215) ON CONFLICT (year) DO UPDATE SET last_serial = 215`);
    await db.execute(sql`INSERT INTO organizations (id, ico, name, billing_name, registered_address, dic) VALUES (${ORG}, '12345679', 'Kavárna Znojmo', 'Kočka s.r.o.', 'Obroková 10, 669 02 Znojmo', NULL)`);
    await db.execute(sql`INSERT INTO orders (id, channel, buyer_organization_id, contact_email, contact_name, subtotal_kc, discount_kc, shipping_kc, shipping_method_label, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs, order_number, paid_at) VALUES
      (${UNPAID}, 'manual', ${ORG}, 'kocka@example.cz', 'Petr Kočka', 343, 0, 267, 'Chlazená přeprava', 610, 'unpaid', 'handed_to_carrier', '2026-11-23T10:00:00Z', '70000060', 70000060, NULL),
      (${PAID}, 'manual', ${ORG}, 'kocka@example.cz', 'Petr Kočka', 379, 0, 0, NULL, 379, 'paid', 'handed_to_carrier', '2026-11-22T10:00:00Z', '70000061', 70000061, '2026-11-22T12:00:00Z'),
      (${NOMAIL}, 'manual', ${ORG}, NULL, 'Petr Kočka', 100, 0, 0, NULL, 100, 'unpaid', 'handed_to_carrier', '2026-11-22T10:00:00Z', '70000062', 70000062, NULL)`);
    await db.execute(sql`INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES
      (${UNPAID}, 'Ochutnávka polévek 6 × 200 ml', 1, 343, 343),
      (${PAID}, 'Dýňová polévka – 3 l', 1, 379, 379),
      (${NOMAIL}, 'Vzorek', 1, 100, 100)`);
  });

  it("nezaplacená: vystaví se s VS = číslo a splatností 14 dní, odejde zákazníkovi s kopií na info@, zapíše se odeslání", async () => {
    const r = await send(UNPAID);
    expect(r).toEqual({ status: "sent", invoiceNumber: "20260216", to: ["kocka@example.cz"] });
    const [doc] = (await db.execute(sql`SELECT number, sent_at, snapshot FROM own_invoice_documents WHERE order_id = ${UNPAID}`)).rows;
    expect(doc.sent_at).not.toBeNull();
    expect(doc.snapshot).toMatchObject({
      paidDate: null,
      vs: null,
      dueDate: "2026-12-08",
      orderReference: "70000060",
      customer: { kind: "company", name: "Kočka s.r.o.", contactPerson: "Petr Kočka", ico: "12345679", zip: "669 02", city: "Znojmo", email: "kocka@example.cz" },
      totalKc: 610,
    });
    expect(doc.snapshot.lines.map((l: { name: string }) => l.name)).toEqual(["Ochutnávka polévek 6 × 200 ml", "Chlazená přeprava"]);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ from: "Begina <info@begina.cz>", to: ["kocka@example.cz"], bcc: ["info@begina.cz"], subject: "Faktura 20260216 – Begina" });
    expect(mails[0].text).toMatch(/^Dobrý den, pane Kočko,/);
    expect(mails[0].text).toContain("variabilní symbol 20260216");
    const [ord] = (await db.execute(sql`SELECT invoice_sent_at FROM orders WHERE id = ${UNPAID}`)).rows;
    expect(ord.invoice_sent_at).not.toBeNull();
    expect(await send(UNPAID)).toEqual({ status: "already_sent" });
    expect(mails).toHaveLength(1);
  });

  it("zaplacená: uhrazená faktura ke dni platby; bez e-mailu zákazníka se vystaví, ale neodejde", async () => {
    expect(await send(PAID)).toMatchObject({ status: "sent", invoiceNumber: "20260217" });
    const [doc] = (await db.execute(sql`SELECT snapshot FROM own_invoice_documents WHERE order_id = ${PAID}`)).rows;
    expect(doc.snapshot.paidDate).toBe("2026-11-22");
    expect(mails[1].text).toContain("je již uhrazená");
    expect(await send(NOMAIL)).toMatchObject({ status: "not_sent", invoiceNumber: "20260218", reason: expect.stringMatching(/nemá e-mail/) });
  });

  it("text e-mailu bez jména: obecné oslovení", () => {
    const m = manualInvoiceEmail({ paidDate: null, totalKc: 100, dueDate: "2026-12-01" } as never, "20260299", null, null);
    expect(m.text.startsWith("Dobrý den,\n")).toBe(true);
  });

  it("e-shop: vystavená vlastní faktura (vazba „void“) se při expedici opravdu pošle", async () => {
    const ESHOP = "f5555555-5555-4555-8555-555555555555";
    await db.execute(sql`INSERT INTO orders (id, channel, contact_email, contact_name, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs, order_number, payment_method_code) VALUES
      (${ESHOP}, 'eshop', 'zakaznik@example.cz', 'Jana Nová', 379, 0, 0, 379, 'paid', 'handed_to_carrier', '2026-11-20T10:00:00Z', '70000070', 70000070, 'karta')`);
    const [inv] = (await db.execute(sql`INSERT INTO invoices (order_id, origin, document_type, doc_state, total_kc, payment_vs) VALUES (${ESHOP}, 'eshop', 'invoice', 'draft', 379, '70000070') RETURNING id`)).rows;
    await db.execute(sql`INSERT INTO invoice_provider_links (invoice_id, provider, state) VALUES (${inv.id}, 'idoklad', 'pending')`);
    const { issueOwnDocument } = await import("../invoicing/ownIssue");
    const { ownSupplier } = await import("../invoicing/ownInvoice");
    await issueOwnDocument(db, {
      invoiceId: inv.id,
      orderId: ESHOP,
      actorName: "test",
      snapshot: {
        version: 1, kind: "invoice", correctsNumber: null, issueDate: "2026-11-24", dueDate: "2026-11-24", paidDate: "2026-11-20", paymentMethod: "card", vs: "70000070", orderReference: "70000070",
        supplier: ownSupplier(ENV), customer: { kind: "person", name: "Jana Nová", contactPerson: null, street: null, city: null, zip: null, country: null, ico: null, dic: null, email: "zakaznik@example.cz" },
        delivery: null, lines: [{ name: "Dýňová polévka – 3 l", quantity: 1, unitPriceKc: 379, totalKc: 379 }], totalKc: 379, note: null,
      },
    });
    const [lnk] = (await db.execute(sql`SELECT state FROM invoice_provider_links WHERE invoice_id = ${inv.id}`)).rows;
    expect(lnk.state).toBe("void");
    const { issueAndSendInvoice } = await import("../invoicing/afterPaid");
    const before = mails.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await issueAndSendInvoice(db, ESHOP, "https://moje.begina.cz", { type: "system", name: "Expedice" }, { env: ENV, email: { config: mailer.config as any, transport: mailer.transport } });
    expect(r).toMatchObject({ status: "already_issued", emailed: true });
    expect(mails.length).toBe(before + 1);
    expect(mails.at(-1)!.to).toEqual(["zakaznik@example.cz"]);
  });

  it("hotově při předání: při Odesláno nic; po zaplacení uhrazená faktura „hotově“", async () => {
    const CASH = "f6666666-6666-4666-8666-666666666666";
    await db.execute(sql`INSERT INTO orders (id, channel, buyer_organization_id, contact_email, contact_name, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs, order_number, payment_method_label) VALUES
      (${CASH}, 'manual', ${ORG}, 'kocka@example.cz', 'Petr Kočka', 200, 0, 0, 200, 'unpaid', 'out_for_delivery', '2026-11-23T10:00:00Z', '70000080', 70000080, 'hotově')`);
    await db.execute(sql`INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES (${CASH}, 'Kulajda – 3 l', 1, 200, 200)`);
    expect(await send(CASH)).toMatchObject({ status: "not_sent", reason: expect.stringMatching(/Platí se při předání/) });
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM own_invoice_documents WHERE order_id = ${CASH}`)).rows[0].n).toBe(0);
    await db.execute(sql`UPDATE orders SET payment_status = 'paid' WHERE id = ${CASH}`);
    expect(await send(CASH)).toMatchObject({ status: "sent" });
    const [doc] = (await db.execute(sql`SELECT snapshot FROM own_invoice_documents WHERE order_id = ${CASH}`)).rows;
    expect(doc.snapshot).toMatchObject({ paymentMethod: "cash", paidDate: "2026-11-24" });
  });

  it("už vystavená neuhrazená faktura → po ručním „Zaplaceno“ uhrazená", async () => {
    const { markManualOrderInvoicePaid } = await import("../invoicing/ownManual");
    expect(await markManualOrderInvoicePaid(db, NOMAIL, "Lucie", "2026-11-25")).toBe(true);
    const [doc] = (await db.execute(sql`SELECT paid_on::text AS paid_on, version FROM own_invoice_documents WHERE order_id = ${NOMAIL}`)).rows;
    expect(doc).toEqual({ paid_on: "2026-11-25", version: 2 });
    expect(await markManualOrderInvoicePaid(db, NOMAIL, "Lucie", "2026-11-25")).toBe(false);
  });
});
