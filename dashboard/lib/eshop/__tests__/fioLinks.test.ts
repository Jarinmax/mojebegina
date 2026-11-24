// Fio banka: vazba příchozí platby na objednávku a fakturu (jen čtení).
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import type { FioTransaction } from "../fio";
import { linkFioPayments } from "../fioLinks";
import { createMigratedDb } from "./helpers/migratedDb";

const tx = (id: string, amountKc: number, vs: string | null): FioTransaction => ({ id, date: "2026-11-20", amountHal: Math.round(amountKc * 100), currency: "CZK", vs, counterparty: "Plátce", message: null });

describe("Fio: vazba platby na objednávku a fakturu (PGlite)", () => {
  let db: Parameters<typeof linkFioPayments>[0];
  const PAID = "c1111111-1111-4111-8111-111111111111";
  const UNPAID = "c2222222-2222-4222-8222-222222222222";
  const AUTO = "c3333333-3333-4333-8333-333333333333";

  beforeAll(async () => {
    const created = await createMigratedDb();
    db = created.db as unknown as Parameters<typeof linkFioPayments>[0];
    await created.db.execute(sql`INSERT INTO orders (id, channel, order_number, contact_email, contact_name, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs, payment_method_code) VALUES
      (${PAID}, 'eshop', 70000021, 'a@example.cz', 'A', 758, 0, 267, 1025, 'paid', 'new', '2026-11-19T10:00:00Z', '70000021', 'prevod'),
      (${UNPAID}, 'eshop', 70000022, 'b@example.cz', 'B', 199, 0, 267, 466, 'unpaid', 'new', '2026-11-19T10:00:00Z', '70000022', 'prevod'),
      (${AUTO}, 'eshop', 70000024, 'c@example.cz', 'C', 199, 0, 267, 466, 'paid', 'new', '2026-11-19T10:00:00Z', '70000024', 'prevod')`);
    await created.db.execute(sql`INSERT INTO payments (order_id, source, external_id, method, direction, status, amount_hal, vs, occurred_at, match_status, note, raw) VALUES
      (${AUTO}, 'bank', '903', 'bank_transfer', 'inflow', 'succeeded', 46600, '70000024', '2026-11-20T12:00:00Z', 'matched', 'Fio', '{}'::jsonb),
      (${UNPAID}, 'bank', '904', 'bank_transfer', 'inflow', 'pending', 40000, '70000022', '2026-11-20T12:00:00Z', 'needs_review', 'nesedí', '{}'::jsonb)`);
    await created.db.execute(sql`INSERT INTO own_invoice_documents (number, kind, order_id, issue_date, total_kc, customer_name, snapshot, issued_by_name) VALUES
      ('20260215', 'invoice', ${PAID}, '2026-11-23', 1025, 'A', '{"paidDate":"2026-11-20"}'::jsonb, 'Test'),
      ('20260217', 'invoice', NULL, '2026-11-23', 3000, 'F', '{}'::jsonb, 'Test'),
      ('20260218', 'invoice', NULL, '2026-11-23', 500, 'G', '{}'::jsonb, 'Test')`);
    await created.db.execute(sql`UPDATE own_invoice_documents SET paid_on = '2026-11-21' WHERE number = '20260218'`);
  });

  it("bez plateb se do databáze nesahá", async () => {
    expect((await linkFioPayments(db, [])).size).toBe(0);
  });

  it("stav a čísla objednávky a faktury podle symbolu, automatu a čísla faktury", async () => {
    const links = await linkFioPayments(db, [
      tx("901", 1025, "70000021"), // ručně zapsaná jako zaplacená
      tx("902", 466, "70000022"), // sedí, ale ještě nezapsáno
      tx("903", 466, "70000024"), // zapsal automat
      tx("904", 400, "70000022"), // automat: nesedí částka
      tx("905", 999, "70000021"), // symbol sedí, částka ne
      tx("906", 3000, "20260217"), // číslo vlastní faktury, neuhrazená
      tx("907", 500, "20260218"), // číslo vlastní faktury, uhrazená
      tx("908", 2999, "20260217"), // číslo faktury, jiná částka
      tx("910", 1726.58, null), // výplata Stripe bez symbolu
      tx("911", 998, "20260214"), // starší faktura z iDokladu
      tx("912", 100, "5215"), // neznámý krátký symbol
    ]);
    const pick = (id: string) => {
      const l = links.get(id)!;
      return [l.status, l.orderNumber, l.invoiceNumber];
    };
    expect(pick("901")).toEqual(["sparovano", "70000021", "20260215"]);
    expect(links.get("901")).toMatchObject({ statusLabel: "spárováno", orderPaymentStatus: "paid", orderTotalKc: 1025, invoicePaidOn: "2026-11-20" });
    expect(pick("902")).toEqual(["ceka_na_zapis", "70000022", null]);
    expect(pick("903")).toEqual(["sparovano", "70000024", null]);
    expect(links.get("903")!.note).toBe("zapsal automat Fio");
    expect(pick("904")).toEqual(["nesedi_castka", "70000022", null]);
    expect(pick("905")).toEqual(["nesedi_castka", "70000021", "20260215"]);
    expect(pick("906")).toEqual(["ceka_na_zapis", null, "20260217"]);
    expect(pick("907")).toEqual(["sparovano", null, "20260218"]);
    expect(links.get("907")!.invoicePaidOn).toBe("2026-11-21");
    expect(pick("908")).toEqual(["nesedi_castka", null, "20260217"]);
    expect(pick("910")).toEqual(["nesparovano", null, null]);
    expect(links.get("910")!.note).toBe("platba nemá variabilní symbol");
    expect(links.get("911")!.note).toContain("iDokladu");
    expect(pick("912")).toEqual(["nesparovano", null, null]);
    expect(links.size).toBe(11);
  });

  it("nic nezapisuje", async () => {
    const before = await db.execute(sql`SELECT count(*)::int AS n FROM payments`);
    await linkFioPayments(db, [tx("920", 466, "70000022")]);
    const after = await db.execute(sql`SELECT count(*)::int AS n, (SELECT payment_status FROM orders WHERE id = ${UNPAID}) AS s FROM payments`);
    expect(after.rows[0]).toEqual({ n: (before.rows[0] as { n: number }).n, s: "unpaid" });
  });
});
