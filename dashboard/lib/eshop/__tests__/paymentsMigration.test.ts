// ESHOP 1.0 — migrační balíček Platby a fakturace, krok A
// (docs/eshop-payments/*) nad PGlite s daty jako na Preview (ověřeno
// read-only 5. 10. 2026: 9 objednávek, z toho 6 e-shopových, 2 importované
// faktury The Cup). Ověřuje přesně ty soubory, které se spouštějí v Neon
// SQL Editoru: kontrola před → migrace → kontrola po → scénáře → vrácení.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { invoices, orders } from "@/lib/db/schema";
import { createMigratedDb } from "./helpers/migratedDb";

const DB_TEST = { timeout: 120_000 };
const DIR = path.join(__dirname, "../../../docs/eshop-payments");
const file = (name: string) => readFileSync(path.join(DIR, name), "utf8");

const ORG = "11111111-1111-4111-8111-111111111111";
const CUP = ["22222222-2222-4222-8222-222222222221", "22222222-2222-4222-8222-222222222222"];
const ORDER = "33333333-3333-4333-8333-333333333333";

async function check(pg: PGlite, name: string): Promise<string> {
  const { rows } = await pg.query<Record<string, unknown>>(file(name).replace(/--[^\n]*\n/g, ""));
  return Object.values(rows[0]).map(String).join(" | ");
}

async function schemaDump(pg: PGlite) {
  const { rows } = await pg.query(`
    SELECT 'col' AS kind, table_name AS t, column_name AS n, data_type || ':' || is_nullable || ':' || coalesce(column_default, '') AS d
      FROM information_schema.columns WHERE table_schema = 'public'
    UNION ALL SELECT 'con', table_name, constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema = 'public'
    UNION ALL SELECT 'idx', tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
    UNION ALL SELECT 'seq', '', sequence_name, '' FROM information_schema.sequences WHERE sequence_schema = 'public'
    UNION ALL SELECT 'trg', '', tgname, '' FROM pg_trigger WHERE NOT tgisinternal
    ORDER BY 1, 2, 3`);
  return rows;
}

describe("platby a fakturace — krok A nad daty jako na Preview", DB_TEST, () => {
  let pg: PGlite;
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
  let before: unknown[];
  const q = async (s: string) => (await pg.query<Record<string, unknown>>(s)).rows;
  const fails = async (s: string) => {
    try {
      await pg.exec(s);
      return false;
    } catch {
      return true;
    }
  };
  const balance = async (orderId = ORDER) =>
    (await q(`SELECT net_hal::int AS net, balance_state AS state FROM order_payment_balance WHERE order_id = '${orderId}'`))[0];
  const pay = (cols: string, vals: string) => pg.exec(`INSERT INTO payments (${cols}) VALUES (${vals})`);

  beforeAll(async () => {
    ({ pg, db } = await createMigratedDb());
    await pg.exec(`
      INSERT INTO organizations (id, ico, name, registered_address) VALUES ('${ORG}', '11935367', 'The Cup s.r.o.', 'Praha');
      INSERT INTO orders (id, buyer_organization_id, subtotal_kc, total_kc, payment_status, channel) VALUES
        ('${CUP[0]}', '${ORG}', 758, 758, 'paid', 'import'), ('${CUP[1]}', '${ORG}', 1137, 1137, 'paid', 'import');
      INSERT INTO invoices (order_id, organization_id, invoice_number, status, total_kc, issued_at) VALUES
        ('${CUP[0]}', '${ORG}', '20260152', 'paid', 758, '2026-08-30'), ('${CUP[1]}', '${ORG}', '20260153', 'paid', 1137, '2026-09-03');
      INSERT INTO orders (buyer_organization_id, subtotal_kc, total_kc, payment_status, channel) VALUES ('${ORG}', 379, 379, 'unpaid', 'manual');
      INSERT INTO orders (subtotal_kc, total_kc, payment_status, channel, contact_email)
        SELECT 379, 379, 'unpaid', 'eshop', 'zakaznik' || g || '@example.cz' FROM generate_series(1, 6) g;`);
    before = await schemaDump(pg);
  });

  it("kontrola před → migrace → kontrola po", async () => {
    expect(await check(pg, "10_before.sql")).toBe("0 | 0 | 1 | 2 | 9 | 6");
    await pg.exec(file("11_migration.sql"));
    expect(await check(pg, "12_after.sql")).toBe("5 | 1 | 1 | 1 | 0 | 2 | 2 | 9 | 0 | 0 | 9");
  });

  it("dnešní kód funguje dál (zpětná kompatibilita kroku A)", async () => {
    // drizzle se současným schema.ts: zápis e-shopové objednávky bez VS a čtení faktur
    const [row] = await db
      .insert(orders)
      .values({ subtotalKc: 100, totalKc: 100, paymentStatus: "unpaid", channel: "eshop", contactEmail: "kompat@example.cz" })
      .returning({ id: orders.id });
    const joined = await db
      .select({ number: invoices.invoiceNumber })
      .from(orders)
      .leftJoin(invoices, eq(invoices.orderId, orders.id))
      .where(eq(orders.buyerOrganizationId, ORG));
    expect(joined.map((r) => r.number).filter(Boolean).sort()).toEqual(["20260152", "20260153"]);
    await pg.exec(`DELETE FROM orders WHERE id = '${row.id}'`);
  });

  it("VS: řada 7xxxxxxx, unikátní, neměnný", async () => {
    await pg.exec(`INSERT INTO orders (id, subtotal_kc, total_kc, payment_status, channel, contact_email, payment_vs)
      VALUES ('${ORDER}', 1000, 1000, 'unpaid', 'eshop', 'x@y.cz', '7' || lpad(nextval('payment_vs_seq')::text, 7, '0'))`);
    expect((await q(`SELECT payment_vs FROM orders WHERE id = '${ORDER}'`))[0].payment_vs).toBe("70000001");
    expect(await fails(`UPDATE orders SET payment_vs = '70000099' WHERE id = '${ORDER}'`)).toBe(true);
    expect(await fails(`UPDATE orders SET payment_vs = NULL WHERE id = '${ORDER}'`)).toBe(true);
    expect(await fails(`UPDATE orders SET payment_vs = '70000001' WHERE id = '${CUP[0]}'`)).toBe(true); // unikátní
    expect(await fails(`UPDATE orders SET payment_vs = '900001' WHERE id = '${CUP[0]}'`)).toBe(true); // formát
    await pg.exec(`UPDATE orders SET note = 'jiná změna projde' WHERE id = '${ORDER}'`);
  });

  it("platby: stav transakce a směr peněz jsou oddělené; idempotence podle zdroje", async () => {
    const base = "order_id, source, external_id, method, direction, status, amount_hal";
    expect(await balance()).toEqual({ net: 0, state: "unpaid" });
    // pokus kartou: pending → failed; nic nezaplatí
    await pay(base, `'${ORDER}', 'stripe', 'cs_1', 'card', 'inflow', 'pending', 100000`);
    await pg.exec(`UPDATE payments SET status = 'failed' WHERE source = 'stripe' AND external_id = 'cs_1'`);
    expect(await balance()).toEqual({ net: 0, state: "unpaid" });
    // opakovaný webhook nezapíše druhý řádek
    expect(await fails(`INSERT INTO payments (${base}) VALUES ('${ORDER}', 'stripe', 'cs_1', 'card', 'inflow', 'pending', 100000)`)).toBe(true);
    // částečná úhrada + doplatek
    await pay(`${base}, occurred_at, recorded_by_user_id`, `'${ORDER}', 'manual', 'tok-1', 'bank_transfer', 'inflow', 'succeeded', 40000, now(), 'u1'`);
    expect(await balance()).toEqual({ net: 40000, state: "partially_paid" });
    await pay(`${base}, occurred_at, recorded_by_user_id`, `'${ORDER}', 'manual', 'tok-2', 'bank_transfer', 'inflow', 'succeeded', 60000, now(), 'u1'`);
    expect(await balance()).toEqual({ net: 100000, state: "paid" });
    // import banky doloží ruční potvrzení → ruční záznam 'superseded', nic se nezapočítá dvakrát
    await pay(`id, ${base}, occurred_at, vs`, `'44444444-4444-4444-8444-444444444444', '${ORDER}', 'bank', '2000123456:999', 'bank_transfer', 'inflow', 'succeeded', 60000, now(), '70000001'`);
    expect(await fails(`UPDATE payments SET status = 'superseded' WHERE external_id = 'tok-2'`)).toBe(true); // bez odkazu nejde
    await pg.exec(`UPDATE payments SET status = 'superseded', superseded_by_payment_id = '44444444-4444-4444-8444-444444444444' WHERE external_id = 'tok-2'`);
    expect(await balance()).toEqual({ net: 100000, state: "paid" });
    // přeplatek → částečná vratka přeplatku
    await pay(`${base}, occurred_at, recorded_by_user_id`, `'${ORDER}', 'manual', 'tok-3', 'bank_transfer', 'inflow', 'succeeded', 5000, now(), 'u1'`);
    expect(await balance()).toEqual({ net: 105000, state: "overpaid" });
    await pg.exec(`INSERT INTO payments (${base}, occurred_at, recorded_by_user_id, refund_of_payment_id)
      SELECT '${ORDER}', 'manual', 'tok-4', 'bank_transfer', 'outflow', 'succeeded', 5000, now(), 'u1', id FROM payments WHERE external_id = 'tok-3'`);
    await pg.exec(`UPDATE payments SET status = 'refunded' WHERE external_id = 'tok-3'`);
    expect(await balance()).toEqual({ net: 100000, state: "paid" });
    // vratka, která ještě neproběhla, nic neodečte
    await pay(`${base}, recorded_by_user_id`, `'${ORDER}', 'manual', 'tok-5', 'bank_transfer', 'outflow', 'pending', 100000, 'u1'`);
    expect(await balance()).toEqual({ net: 100000, state: "paid" });
    // neplatné kombinace
    expect(await fails(`INSERT INTO payments (${base}, occurred_at, recorded_by_user_id) VALUES ('${ORDER}', 'manual', 'x1', 'cash', 'outflow', 'refunded', 1, now(), 'u1')`)).toBe(true); // vrácená může být jen příchozí
    expect(await fails(`INSERT INTO payments (${base}, refund_of_payment_id) SELECT '${ORDER}', 'stripe', 're_x', 'card', 'inflow', 'succeeded', 1, id FROM payments LIMIT 1`)).toBe(true); // vratka je odchozí
    expect(await fails(`INSERT INTO payments (${base}) VALUES ('${ORDER}', 'stripe', 'cs_2', 'card', 'inflow', 'succeeded', 100)`)).toBe(true); // proběhlá bez času
    expect(await fails(`INSERT INTO payments (${base}, occurred_at) VALUES ('${ORDER}', 'stripe', 'cs_3', 'card', 'inflow', 'succeeded', -100, now())`)).toBe(true); // záporná částka
    expect(await fails(`INSERT INTO payments (${base}, occurred_at) VALUES ('${ORDER}', 'manual', 'tok-6', 'cash', 'inflow', 'succeeded', 100, now())`)).toBe(true); // ruční bez uživatele
    expect(await fails(`INSERT INTO payments (source, external_id, method, direction, status, amount_hal) VALUES ('bank', 'x:1', 'bank_transfer', 'inflow', 'pending', 100)`)).toBe(true); // spárovaná bez objednávky
    await pay("source, external_id, method, direction, status, amount_hal, occurred_at, match_status", `'bank', 'x:2', 'bank_transfer', 'inflow', 'succeeded', 100, now(), 'unmatched'`);
    // celá částka vrácena kartou → 'refunded'
    await pg.exec(`UPDATE payments SET status = 'cancelled' WHERE external_id = 'tok-5'`);
    await pay(`${base}, occurred_at`, `'${ORDER}', 'stripe', 're_1', 'card', 'outflow', 'succeeded', 100000, now()`);
    expect(await balance()).toEqual({ net: 0, state: "refunded" });
  });

  it("faktury: jedna prodejní na objednávku, dobropis, obecná vazba na poskytovatele", async () => {
    await pg.exec(`INSERT INTO invoice_customers (kind, email_normalized, name) VALUES ('person', 'x@y.cz', 'X Y')`);
    expect(await fails(`INSERT INTO invoice_customers (kind, email_normalized, name) VALUES ('person', 'x@y.cz', 'Jiný')`)).toBe(true);
    await pg.exec(`INSERT INTO invoice_customers (kind, ico, email_normalized, name) VALUES ('company', '11935367', 'a@thecup.cz', 'The Cup')`);
    expect(await fails(`INSERT INTO invoice_customers (kind, ico, name) VALUES ('company', '11935367', 'Duplicita')`)).toBe(true);
    await pg.exec(`INSERT INTO invoice_customer_refs (customer_id, provider, external_id) SELECT id, 'idoklad', '9001' FROM invoice_customers WHERE kind = 'person'`);
    expect(await fails(`INSERT INTO invoice_customer_refs (customer_id, provider, external_id) SELECT id, 'idoklad', '9002' FROM invoice_customers WHERE kind = 'person'`)).toBe(true);

    const INV = "55555555-5555-4555-8555-555555555555";
    await pg.exec(`INSERT INTO invoices (id, order_id, origin, total_kc, payment_vs, customer_id)
      SELECT '${INV}', '${ORDER}', 'eshop', 1000, '70000001', id FROM invoice_customers WHERE kind = 'person'`);
    expect((await q(`SELECT doc_state, document_type FROM invoices WHERE id = '${INV}'`))[0]).toEqual({ doc_state: "draft", document_type: "invoice" });
    expect(await fails(`INSERT INTO invoices (order_id, origin, total_kc) VALUES ('${ORDER}', 'eshop', 1000)`)).toBe(true); // druhá prodejní
    expect(await fails(`INSERT INTO invoices (order_id, total_kc) VALUES ('${ORDER}', 1000)`)).toBe(true); // origin povinný
    expect(await fails(`UPDATE invoices SET doc_state = 'issued' WHERE id = '${INV}'`)).toBe(true); // bez čísla

    // pokus o vystavení: dry-run → zrušen, pak ostrý; historie zůstává
    await pg.exec(`INSERT INTO invoice_provider_links (invoice_id, provider, state, request_payload) VALUES ('${INV}', 'idoklad', 'dry_run', '{}'::jsonb)`);
    expect(await fails(`INSERT INTO invoice_provider_links (invoice_id, provider) VALUES ('${INV}', 'idoklad')`)).toBe(true); // jedna aktivní
    await pg.exec(`UPDATE invoice_provider_links SET state = 'void' WHERE invoice_id = '${INV}'`);
    await pg.exec(`INSERT INTO invoice_provider_links (invoice_id, provider) VALUES ('${INV}', 'idoklad')`);
    expect(await fails(`UPDATE invoice_provider_links SET state = 'failed' WHERE invoice_id = '${INV}' AND state = 'pending'`)).toBe(true); // chyba bez popisu
    await pg.exec(`UPDATE invoice_provider_links SET state = 'failed', attempts = 1, last_error = 'timeout', last_error_at = now() WHERE invoice_id = '${INV}' AND state = 'pending'`);
    expect(await fails(`UPDATE invoice_provider_links SET state = 'issued' WHERE invoice_id = '${INV}' AND state = 'failed'`)).toBe(true); // bez čísla a ID
    await pg.exec(`UPDATE invoice_provider_links SET state = 'issued', external_id = '777', external_number = 'E2026001', issued_at = now(),
      pdf_storage_key = 'invoices/E2026001.pdf', attempts = 2 WHERE invoice_id = '${INV}' AND state = 'failed'`);
    await pg.exec(`UPDATE invoices SET doc_state = 'issued', invoice_number = 'E2026001', issued_at = now() WHERE id = '${INV}'`);
    expect((await q(`SELECT count(*)::int AS c FROM invoice_provider_links WHERE invoice_id = '${INV}'`))[0].c).toBe(2);

    // dobropis: povolen (i víc), musí odkazovat na fakturu; číslo u poskytovatele unikátní
    const CN = "66666666-6666-4666-8666-666666666666";
    await pg.exec(`INSERT INTO invoices (id, order_id, origin, document_type, corrects_invoice_id, doc_state, total_kc, invoice_number, issued_at)
      VALUES ('${CN}', '${ORDER}', 'eshop', 'credit_note', '${INV}', 'issued', -1000, 'D2026001', now())`);
    expect(await fails(`INSERT INTO invoices (order_id, origin, document_type, total_kc) VALUES ('${ORDER}', 'eshop', 'credit_note', -1)`)).toBe(true);
    expect(await fails(`INSERT INTO invoice_provider_links (invoice_id, provider, state, external_id, external_number, issued_at)
      VALUES ('${CN}', 'idoklad', 'issued', '778', 'E2026001', now())`)).toBe(true); // číslo už použité
    await pg.exec(`INSERT INTO invoice_provider_links (invoice_id, provider, state, external_id, external_number, issued_at)
      VALUES ('${CN}', 'idoklad', 'issued', '778', 'D2026001', now())`);
    // jiný poskytovatel = jen jiná hodnota, schéma ho nezamyká
    await pg.exec(`INSERT INTO invoice_provider_links (invoice_id, provider, state) SELECT id, 'fakturoid', 'dry_run' FROM invoices WHERE invoice_number = '20260152'`);
    expect(await fails(`INSERT INTO invoice_provider_links (invoice_id, provider) SELECT id, 'iDoklad!', 'pending' FROM invoices WHERE invoice_number = '20260153'`)).toBe(true);
    // importované faktury beze změny
    expect(await q(`SELECT invoice_number, origin, doc_state, status FROM invoices WHERE origin = 'import' ORDER BY invoice_number`)).toEqual([
      { invoice_number: "20260152", origin: "import", doc_state: "issued", status: "paid" },
      { invoice_number: "20260153", origin: "import", doc_state: "issued", status: "paid" },
    ]);
  });

  it("vrácení: s daty se zastaví a nic nezmění; bez dat vrátí přesně původní schéma", async () => {
    expect(await fails(file("19_rollback.sql"))).toBe(true);
    await pg.exec("ROLLBACK").catch(() => undefined); // PGlite po chybě uvnitř BEGIN
    expect(await check(pg, "12_after.sql")).toMatch(/^5 \| 1 \| 1 \| 1 \| 0 \| 4 \| 2 \| 10 \| 1 \| \d+ \| 10$/);

    await pg.exec(`
      DELETE FROM invoice_provider_links; DELETE FROM invoice_customer_refs;
      DELETE FROM invoices WHERE origin <> 'import' AND document_type = 'credit_note';
      DELETE FROM invoices WHERE origin <> 'import';
      DELETE FROM invoice_customers; UPDATE payments SET superseded_by_payment_id = NULL, refund_of_payment_id = NULL, status = 'failed';
      DELETE FROM payments; ALTER TABLE orders DISABLE TRIGGER orders_payment_vs_immutable;
      DELETE FROM orders WHERE id = '${ORDER}'; ALTER TABLE orders ENABLE TRIGGER orders_payment_vs_immutable;`);
    await pg.exec(file("19_rollback.sql"));
    expect(await schemaDump(pg)).toEqual(before);
    expect(await check(pg, "10_before.sql")).toBe("0 | 0 | 1 | 2 | 9 | 6");
    // a migrace jde po vrácení spustit znovu
    await pg.exec(file("11_migration.sql"));
    expect(await check(pg, "12_after.sql")).toBe("5 | 1 | 1 | 1 | 0 | 2 | 2 | 9 | 0 | 0 | 9");
  });
});
