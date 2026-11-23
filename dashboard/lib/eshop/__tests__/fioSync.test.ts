// Fio banka: čtení pohybů a párování plateb s objednávkami e-shopu.
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { parseFioTransactions } from "../fio";
import { invoiceFitsOrder, nameKey, syncFioPayments, type FioSyncDeps, type MatchInvoice } from "../fioSync";
import type { EmailMessage } from "../email/resend";
import { createMigratedDb } from "./helpers/migratedDb";

const col = (value: unknown, id: number) => ({ value, name: "x", id });
const tx = (id: number, date: unknown, amount: number, vs: string | null, who = "Monika Chuda", currency = "CZK") => ({
  column22: col(id, 22),
  column0: col(date, 0),
  column1: col(amount, 1),
  column14: col(currency, 14),
  column5: vs === null ? null : col(vs, 5),
  column10: col(who, 10),
  column16: col("objednavka", 16),
});
const statement = (rows: unknown[]) => ({ accountStatement: { info: {}, transactionList: { transaction: rows } } });

describe("Fio: čtení pohybů", () => {
  it("datum jako text i jako epocha, částka na haléře, VS bez úvodních nul", () => {
    const parsed = parseFioTransactions(statement([tx(1, "2026-11-13+0100", 466, "0070000013"), tx(2, Date.UTC(2026, 10, 14, 11), 1234.5, null), { column22: null }]));
    expect(parsed).toEqual([
      { id: "1", date: "2026-11-13", amountHal: 46600, currency: "CZK", vs: "70000013", counterparty: "Monika Chuda", message: "objednavka" },
      { id: "2", date: "2026-11-14", amountHal: 123450, currency: "CZK", vs: null, counterparty: "Monika Chuda", message: "objednavka" },
    ]);
    const card = parseFioTransactions(statement([{ ...tx(3, "2026-11-18+0100", -512.37, null, ""), column8: col("Platba kartou", 8), column7: col("Nákup: VERCEL INC., COVINA, US", 7), column18: col("24.20 USD", 18) }]));
    expect(card).toEqual([
      { id: "3", date: "2026-11-18", amountHal: -51237, currency: "CZK", vs: null, counterparty: null, message: "objednavka", kind: "Platba kartou", ident: "Nákup: VERCEL INC., COVINA, US", detail: "24.20 USD" },
    ]);
    expect(parseFioTransactions({})).toEqual([]);
    expect(parseFioTransactions({ accountStatement: { transactionList: null } })).toEqual([]);
  });
});

describe("Fio: párování plateb s objednávkami (PGlite)", () => {
  let db: Parameters<typeof syncFioPayments>[0];
  const mails: EmailMessage[] = [];
  const afterPaid: string[] = [];
  const issued: string[] = [];
  const NOW = new Date("2026-11-15T12:00:00Z");
  const A = "b1111111-1111-4111-8111-111111111111";
  const B = "b2222222-2222-4222-8222-222222222222";
  const rows = [
    tx(101, "2026-11-13+0100", 466, "70000013"), // sedí → zaplaceno
    tx(102, "2026-11-13+0100", 400, "70000020"), // symbol sedí, částka ne
    tx(103, "2026-11-13+0100", -466, "70000013"), // odchozí
    tx(104, "2026-11-13+0100", 466, null), // bez symbolu
    tx(105, "2026-11-13+0100", 466, "79999999"), // neznámý symbol
    tx(106, "2026-11-13+0100", 466, "70000013", "X", "EUR"), // jiná měna
    tx(107, "2026-11-10+0100", 466, "70000030"), // objednávka už je zaplacená (ruční zápis) → nezapočítat podruhé
  ];
  const deps = (): FioSyncDeps => ({
    env: { FIO_API_TOKEN: "tajny-token" },
    baseUrl: "https://moje.begina.cz",
    fetchImpl: (async (url: string) => {
      expect(url).toBe("https://fioapi.fio.cz/v1/rest/periods/tajny-token/2026-11-05/2026-11-15/transactions.json");
      return new Response(JSON.stringify(statement(rows)), { status: 200 });
    }) as unknown as typeof fetch,
    afterPaid: async (orderId) => {
      afterPaid.push(orderId);
    },
    issue: async (orderId) => {
      issued.push(orderId);
      return { status: "issued", invoiceNumber: "9260004", externalId: "1", adopted: false, pdf: { filename: "faktura-9260004.pdf", contentBase64: "UERG", invoiceNumber: "9260004" } };
    },
    mailer: {
      config: { apiKey: "re_x", from: "Begina <info@begina.cz>", replyTo: null, internalTo: ["info@begina.cz"], testRecipients: null },
      transport: async (message) => {
        mails.push(message);
        return { ok: true, id: "m" };
      },
    },
  });

  beforeAll(async () => {
    const created = await createMigratedDb();
    db = created.db as unknown as Parameters<typeof syncFioPayments>[0];
    await created.db.execute(sql`INSERT INTO orders (id, channel, contact_email, contact_name, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs, payment_method_code) VALUES
      (${A}, 'eshop', 'moni@example.cz', 'Monika Chuda', 199, 0, 267, 466, 'unpaid', 'new', '2026-11-13T10:00:00Z', '70000013', 'prevod'),
      (${B}, 'eshop', 'jiny@example.cz', 'Jiný Zákazník', 199, 0, 267, 466, 'unpaid', 'new', '2026-11-13T10:00:00Z', '70000020', 'prevod'),
      ('b3333333-3333-4333-8333-333333333333', 'eshop', 'treti@example.cz', 'Třetí', 199, 0, 267, 466, 'paid', 'new', '2026-11-10T10:00:00Z', '70000030', 'prevod')`);
  });

  it("bez tokenu nic nedělá", async () => {
    expect(await syncFioPayments(db, NOW, { ...deps(), env: {} })).toMatchObject({ status: "no-token", paid: [] });
  });

  it("sedí symbol i částka → Zaplaceno s datem z banky, faktura jen na info@begina.cz; nesedí částka → jen upozornění", async () => {
    const result = await syncFioPayments(db, NOW, deps());
    expect(result).toEqual({
      status: "done",
      paid: [{ orderNumber: null, amountKc: 466, invoiceNumber: "9260004" }],
      mismatched: [{ orderNumber: null, receivedKc: 400, expectedKc: 466 }],
      manualPaid: [],
    });
    const orders = await db.execute(sql`SELECT id, payment_status, paid_at FROM orders WHERE payment_vs IN ('70000013', '70000020') ORDER BY payment_vs`);
    expect(orders.rows[0]).toMatchObject({ id: A, payment_status: "paid" });
    expect(new Date(orders.rows[0].paid_at as string).toISOString()).toBe("2026-11-13T12:00:00.000Z");
    expect(orders.rows[1]).toMatchObject({ id: B, payment_status: "unpaid" });
    expect(afterPaid).toEqual([A]);
    expect(issued).toEqual([A]);

    const paidMail = mails.find((m) => m.subject.startsWith("Platba přišla"));
    expect(paidMail?.to).toEqual(["info@begina.cz"]);
    expect(paidMail?.text).toContain("Faktura 9260004 je vystavená a je v příloze. Zákazníkovi faktura odejde sama, až objednávku označíte jako předanou dopravci.");
    expect(paidMail?.attachments?.[0]).toMatchObject({ filename: "faktura-9260004.pdf", contentType: "application/pdf" });
    const wrong = mails.find((m) => m.subject.startsWith("Platba nesedí"));
    expect(wrong?.text).toContain("přišlo 400 Kč");
    expect(wrong?.text).toContain("zůstává NEZAPLACENÁ");
    expect(mails.every((m) => m.to.join() === "info@begina.cz" && !JSON.stringify(m).includes("tajny-token"))).toBe(true);

    const payments = await db.execute(sql`SELECT external_id, status, match_status, source FROM payments ORDER BY external_id`);
    expect(payments.rows).toEqual([
      { external_id: "101", status: "succeeded", match_status: "matched", source: "bank" },
      { external_id: "102", status: "pending", match_status: "needs_review", source: "bank" },
    ]);
  });

  it("opakovaný běh nic nezapíše ani neposílá podruhé", async () => {
    mails.length = 0;
    const again = await syncFioPayments(db, NOW, deps());
    expect(again).toEqual({ status: "done", paid: [], mismatched: [], manualPaid: [] });
    expect(mails).toEqual([]);
    expect(afterPaid).toEqual([A]);
    const count = await db.execute(sql`SELECT count(*)::int AS n FROM payments`);
    expect(count.rows[0].n).toBe(2);
  });

  it("výpadek Fio: nic se nezapíše a chyba neobsahuje token", async () => {
    const result = await syncFioPayments(db, NOW, { ...deps(), fetchImpl: (async () => new Response("x", { status: 409 })) as unknown as typeof fetch });
    expect(result).toMatchObject({ status: "fio-error", error: "Fio API vrátilo stav 409" });
    expect(mails.at(-1)?.subject).toBe("Fio: platby se nepodařilo načíst");
    expect(JSON.stringify(mails.at(-1))).not.toContain("tajny-token");
  });
});

describe("Fio: ruční objednávka zaplacená s číslem faktury (PGlite)", () => {
  let db: Parameters<typeof syncFioPayments>[0];
  const mails: EmailMessage[] = [];
  const lookups: string[] = [];
  const NOW = new Date("2026-11-15T12:00:00Z");
  const ORG = "c1111111-1111-4111-8111-111111111111";
  const PRIVATE = "c2222222-2222-4222-8222-222222222222";
  const CAFE = "d1111111-1111-4111-8111-111111111111";
  const invoices: Record<string, MatchInvoice> = {
    "20260210": { number: "20260210", totalKc: 1516, partnerIco: "76043894", partnerName: "Milan Kašpárek" },
    "20260211": { number: "20260211", totalKc: 900, partnerIco: null, partnerName: "Ľubomír Šimko" },
    "20260212": { number: "20260212", totalKc: 700, partnerIco: null, partnerName: "Jan Dvojí" },
    "20260213": { number: "20260213", totalKc: 1516, partnerIco: "11111111", partnerName: "Cizí Firma" },
    "20260214": { number: "20260214", totalKc: 999, partnerIco: null, partnerName: "Eva Jiná" },
  };
  const rows = [
    tx(201, "2026-11-11+0100", 1516, "20260210", "Milan Kašpárek"), // IČO sedí → zaplaceno
    tx(202, "2026-11-12+0100", 900, "20260211", "SIMKO LUBOMIR"), // bez IČO, sedí jméno z faktury
    tx(203, "2026-11-12+0100", 700, "20260212", "Jan Dvojí"), // dvě stejné objednávky → jen upozornění
    tx(204, "2026-11-12+0100", 1516, "20260213", "Cizí Firma"), // jiné IČO → nic
    tx(205, "2026-11-12+0100", 500, "20260214", "Eva Jiná"), // částka faktury nesedí → nic
    tx(206, "2026-11-12+0100", 333, "20260299", "Nikdo"), // žádná ruční objednávka na 333 Kč → do iDokladu se nesahá
  ];
  const deps = (): FioSyncDeps => ({
    env: { FIO_API_TOKEN: "tajny-token" },
    baseUrl: "https://moje.begina.cz",
    fetchImpl: (async () => new Response(JSON.stringify(statement(rows)), { status: 200 })) as unknown as typeof fetch,
    afterPaid: async () => {
      throw new Error("u ruční objednávky se zákazníkovi nic neposílá");
    },
    issue: async () => {
      throw new Error("u ruční objednávky se faktura nevystavuje");
    },
    findInvoice: async (number) => {
      lookups.push(number);
      return invoices[number] ?? null;
    },
    mailer: {
      config: { apiKey: "re_x", from: "Begina <info@begina.cz>", replyTo: null, internalTo: ["info@begina.cz"], testRecipients: null },
      transport: async (message) => {
        mails.push(message);
        return { ok: true, id: "m" };
      },
    },
  });

  beforeAll(async () => {
    const created = await createMigratedDb();
    db = created.db as unknown as Parameters<typeof syncFioPayments>[0];
    await created.db.execute(sql`INSERT INTO organizations (id, ico, name, registered_address) VALUES
      (${ORG}, '76043894', 'Café Academia', 'Korunní 1208/74, Praha'),
      (${PRIVATE}, '00000001', 'Soukromý zákazník', '-')`);
    await created.db.execute(sql`INSERT INTO orders (id, channel, buyer_organization_id, contact_email, contact_name, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs) VALUES
      (${CAFE}, 'manual', ${ORG}, 'milan@example.cz', 'Milan Kašpárek', 1516, 0, 0, 1516, 'unpaid', 'delivered', '2026-11-10T10:00:00Z', '70000012'),
      ('d2222222-2222-4222-8222-222222222222', 'manual', ${PRIVATE}, 'simko@example.sk', 'Lubomir Simko', 900, 0, 0, 900, 'invoiced', 'new', '2026-11-09T10:00:00Z', '70000016'),
      ('d3333333-3333-4333-8333-333333333333', 'manual', ${PRIVATE}, 'jan@example.cz', 'Jan Dvojí', 700, 0, 0, 700, 'unpaid', 'new', '2026-11-08T10:00:00Z', '70000018'),
      ('d4444444-4444-4444-8444-444444444444', 'manual', ${PRIVATE}, 'jan@example.cz', 'Jan Dvojí', 700, 0, 0, 700, 'unpaid', 'new', '2026-11-09T10:00:00Z', '70000019'),
      ('d5555555-5555-4555-8555-555555555555', 'manual', ${PRIVATE}, 'eva@example.cz', 'Eva Jiná', 500, 0, 0, 500, 'unpaid', 'new', '2026-11-09T10:00:00Z', '70000021')`);
  });

  it("porovnání jmen a IČO", () => {
    expect(nameKey("  Ľubomír ŠIMKO ")).toBe("lubomir simko");
    const order = { contact_name: "Milan Kašpárek", recipient_name: null, billing_name: null, billing_company: null, org_name: "Café Academia", org_ico: "76043894" };
    expect(invoiceFitsOrder(invoices["20260210"], order)).toBe(true);
    expect(invoiceFitsOrder({ ...invoices["20260210"], partnerIco: "11111111" }, order)).toBe(false); // IČO má přednost před jménem
    expect(invoiceFitsOrder({ ...invoices["20260210"], partnerIco: null }, order)).toBe(true);
    expect(invoiceFitsOrder({ number: "1", totalKc: 1, partnerIco: null, partnerName: null }, order)).toBe(false);
  });

  it("sedí faktura, částka a odběratel na jednu objednávku → Zaplaceno; jinak se nic nezapíše", async () => {
    const result = await syncFioPayments(db, NOW, deps());
    expect(result.paid).toEqual([]);
    expect(result.manualPaid).toEqual([
      { orderNumber: null, amountKc: 1516, invoiceNumber: "20260210" },
      { orderNumber: null, amountKc: 900, invoiceNumber: "20260211" },
    ]);
    expect(lookups).toEqual(["20260210", "20260211", "20260212", "20260214"]); // 20260213: objednávka na 1 516 Kč už je zaplacená
    const orders = await db.execute(sql`SELECT payment_vs, payment_status, paid_at FROM orders ORDER BY payment_vs`);
    expect(orders.rows.map((r) => [r.payment_vs, r.payment_status])).toEqual([
      ["70000012", "paid"],
      ["70000016", "paid"],
      ["70000018", "unpaid"],
      ["70000019", "unpaid"],
      ["70000021", "unpaid"],
    ]);
    expect(new Date(orders.rows[0].paid_at as string).toISOString()).toBe("2026-11-11T12:00:00.000Z");
    const payments = await db.execute(sql`SELECT external_id, status, note FROM payments ORDER BY external_id`);
    expect(payments.rows).toEqual([
      { external_id: "201", status: "succeeded", note: "Fio: Milan Kašpárek · faktura 20260210" },
      { external_id: "202", status: "succeeded", note: "Fio: SIMKO LUBOMIR · faktura 20260211" },
    ]);
    const activity = await db.execute(sql`SELECT kind FROM order_activity WHERE order_id = ${CAFE} ORDER BY kind`);
    expect(activity.rows.map((r) => r.kind)).toEqual(["payment_recorded", "payment_status_changed"]);
    expect(mails.map((m) => m.subject.replace(/\s/g, " "))).toEqual([
      "Platba přišla – faktura 20260210 (Milan Kašpárek), 1 516 Kč",
      "Platba přišla – faktura 20260211 (Ľubomír Šimko), 900 Kč",
      "Platba faktury 20260212 – víc možných objednávek (Jan Dvojí)",
    ]);
    expect(mails[0].text).toContain("zákazníkovi nic neodešlo");
    expect(mails.every((m) => m.to.join() === "info@begina.cz")).toBe(true);
  });

  it("opakovaný běh už zaplacené nezapisuje podruhé", async () => {
    mails.length = 0;
    lookups.length = 0;
    const again = await syncFioPayments(db, NOW, deps());
    expect(again.manualPaid).toEqual([]);
    expect(lookups).toEqual(["20260212", "20260214"]); // jen nespárované platby
    const count = await db.execute(sql`SELECT count(*)::int AS n FROM payments`);
    expect(count.rows[0].n).toBe(2);
  });
});

describe("Fio: platba vlastní faktury MojeBegina (VS = číslo faktury, PGlite)", () => {
  let db: Parameters<typeof syncFioPayments>[0];
  const mails: EmailMessage[] = [];
  const NOW = new Date("2026-11-25T12:00:00Z");
  const rows = [
    tx(301, "2026-11-24+0100", 319, "20260216", "Pan Kočka"), // sedí → uhrazeno
    tx(302, "2026-11-24+0100", 300, "20260217", "Jiný"), // částka nesedí → upozornění
    tx(303, "2026-11-24+0100", 646, "20260218", "Kavárna"), // ruční objednávka + vlastní faktura → obojí zaplaceno, jedna zpráva
  ];
  const deps = (): FioSyncDeps => ({
    env: { FIO_API_TOKEN: "tajny-token" },
    baseUrl: "https://moje.begina.cz",
    fetchImpl: (async () => new Response(JSON.stringify(statement(rows)), { status: 200 })) as unknown as typeof fetch,
    afterPaid: async () => {
      throw new Error("nic se neposílá");
    },
    issue: async () => {
      throw new Error("nic se nevystavuje");
    },
    findInvoice: async () => {
      throw new Error("do iDokladu se u vlastní faktury nesahá");
    },
    mailer: {
      config: { apiKey: "re_x", from: "Begina <info@begina.cz>", replyTo: null, internalTo: ["info@begina.cz"], testRecipients: null },
      transport: async (message) => {
        mails.push(message);
        return { ok: true, id: "m" };
      },
    },
  });

  beforeAll(async () => {
    const created = await createMigratedDb();
    db = created.db as unknown as Parameters<typeof syncFioPayments>[0];
    const { issueOwnDocument } = await import("../invoicing/ownIssue");
    const { ownSupplier } = await import("../invoicing/ownInvoice");
    await created.db.execute(sql`INSERT INTO invoice_number_counters (year, last_serial) VALUES (2026, 215) ON CONFLICT (year) DO UPDATE SET last_serial = 215`);
    const ORG = "e1111111-1111-4111-8111-111111111111";
    await created.db.execute(sql`INSERT INTO organizations (id, ico, name, registered_address) VALUES (${ORG}, '12345679', 'Kavárna', 'Ulice 1, 110 00 Praha')`);
    await created.db.execute(sql`INSERT INTO orders (id, channel, buyer_organization_id, contact_email, contact_name, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs) VALUES
      ('e2222222-2222-4222-8222-222222222222', 'manual', ${ORG}, 'k@example.cz', 'Kavárna', 646, 0, 0, 646, 'unpaid', 'new', '2026-11-23T10:00:00Z', '70000050')`);
    const snap = (name: string, ico: string | null, total: number) => ({
      version: 1 as const,
      kind: "invoice" as const,
      correctsNumber: null,
      issueDate: "2026-11-23",
      dueDate: "2026-12-07",
      paidDate: null,
      paymentMethod: "bank_transfer" as const,
      vs: null,
      orderReference: null,
      supplier: ownSupplier({ ESHOP_BANK_ACCOUNT: "123/0100" }),
      customer: { kind: "company" as const, name, contactPerson: null, street: "Ulice 1", city: "Praha", zip: "110 00", country: "Česká republika", ico, dic: null, email: null },
      delivery: null,
      lines: [{ name: "Položka", quantity: 1, unitPriceKc: total, totalKc: total }],
      totalKc: total,
      note: null,
    });
    for (const [name, ico, total] of [["Pan Kočka", null, 319], ["Jiný", null, 310], ["Kavárna", "12345679", 646]] as const) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await issueOwnDocument(created.db as any, { snapshot: snap(name, ico, total) as any, actorName: "test" });
    }
  });

  it("sedí částka → faktura uhrazená ke dni platby (nová verze); nesedí → jen upozornění; s ruční objednávkou obojí", async () => {
    const result = await syncFioPayments(db, NOW, deps());
    expect(result.invoicesPaid).toEqual([
      { invoiceNumber: "20260216", amountKc: 319 },
      { invoiceNumber: "20260218", amountKc: 646 },
    ]);
    expect(result.manualPaid).toEqual([{ orderNumber: null, amountKc: 646, invoiceNumber: "20260218" }]);
    const docs = await db.execute(sql`SELECT number, version, paid_on::text AS paid_on FROM own_invoice_documents ORDER BY number`);
    expect(docs.rows).toEqual([
      { number: "20260216", version: 2, paid_on: "2026-11-24" },
      { number: "20260217", version: 1, paid_on: null },
      { number: "20260218", version: 2, paid_on: "2026-11-24" },
    ]);
    const pays = await db.execute(sql`SELECT external_id, status, match_status FROM payments ORDER BY external_id`);
    expect(pays.rows).toEqual([
      { external_id: "301", status: "succeeded", match_status: "unmatched" }, // bez objednávky
      { external_id: "302", status: "pending", match_status: "needs_review" },
      { external_id: "303", status: "succeeded", match_status: "matched" },
    ]);
    expect(mails.map((m) => m.subject.replace(/\s/g, " "))).toEqual([
      "Platba přišla – faktura 20260216 (Pan Kočka), 319 Kč",
      "Platba nesedí – faktura 20260217 (Jiný)",
      "Platba přišla – faktura 20260218 (Kavárna), 646 Kč",
    ]);
  });

  it("opakovaný běh nic nezapíše ani nepošle", async () => {
    mails.length = 0;
    const again = await syncFioPayments(db, NOW, deps());
    expect(again.invoicesPaid).toBeUndefined();
    expect(mails).toEqual([]);
  });
});
