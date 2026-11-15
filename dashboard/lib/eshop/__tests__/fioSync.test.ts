// Fio banka: čtení pohybů a párování plateb s objednávkami e-shopu.
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { parseFioTransactions } from "../fio";
import { syncFioPayments, type FioSyncDeps } from "../fioSync";
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
    });
    const orders = await db.execute(sql`SELECT id, payment_status, paid_at FROM orders WHERE payment_vs IN ('70000013', '70000020') ORDER BY payment_vs`);
    expect(orders.rows[0]).toMatchObject({ id: A, payment_status: "paid" });
    expect(new Date(orders.rows[0].paid_at as string).toISOString()).toBe("2026-11-13T12:00:00.000Z");
    expect(orders.rows[1]).toMatchObject({ id: B, payment_status: "unpaid" });
    expect(afterPaid).toEqual([A]);
    expect(issued).toEqual([A]);

    const paidMail = mails.find((m) => m.subject.startsWith("Platba přišla"));
    expect(paidMail?.to).toEqual(["info@begina.cz"]);
    expect(paidMail?.text).toContain("Faktura 9260004 je vystavená a je v příloze. Zákazníkovi zatím NEODEŠLA");
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
    expect(again).toEqual({ status: "done", paid: [], mismatched: [] });
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
