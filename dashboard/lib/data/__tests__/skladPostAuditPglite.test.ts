// Post-implementační audit (druhé kolo, body A a B) — funkční ověření
// proti REÁLNÉ Postgres databázi (PGlite, stejný vzor jako
// lib/eshop/__tests__/migrationChain.test.ts: createMigratedDb()
// aplikuje migraci 0023 tak, jak doopravdy vypadá, žádný mock SQL
// transportu). Dokazuje skutečné chování triggerů/advisory locků, ne jen
// přítomnost textu v SQL (to hlídá skladMigration.test.ts samostatně).
//
// Co TENHLE soubor NEMŮŽE dokázat: skutečné BLOKOVÁNÍ dvou PŘEKRÝVAJÍCÍCH
// SE transakcí (T2 čeká, dokud T1 nedokončí). PGlite má jediné spojení a
// zpracovává příkazy striktně sekvenčně — stejné zjištění je už
// zdokumentované v scripts/eshop-e2e/neon-http-pglite.mjs ("PGlite má
// jediné spojení: souběžné požadavky... by si jinak prokládaly příkazy").
// Nejde tedy vytvořit druhou transakci, která by VIDĚLA první jako
// "běžící, ale nekomitnutou" a čekala na jejím advisory locku — žádný
// multi-backend Postgres server není v tomhle prostředí dostupný (ani
// přes síť, ani jako samostatný proces). Co tenhle soubor DOKAZUJE: že
// výsledná logika (advisory lock + EXISTS kontrola, GUC flag pro reset
// vat_confirmed) je po jednotlivých krocích SPRÁVNÁ nad reálnou Postgres
// sémantikou (ne mock), včetně přesně těch případů, kde by naivní řešení
// selhalo (opětovné schválení na STEJNOU hodnotu, znovupoužití hashe po
// stornu, blokace i proti potvrzené příjemce).
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

// Každý test staví NOVOU PGlite instanci a přehrává celý řetězec migrací
// 0000-0023 (createMigratedDb) — stejně pomalé jako lib/eshop/__tests__/
// migrationChain.test.ts, proto stejný prodloužený timeout (DB_TEST).
const DB_TEST = { timeout: 60_000 };
import { createMigratedDb } from "../../eshop/__tests__/helpers/migratedDb";

const LAST_SKLAD_MIGRATION = "0023_phase_22_sklad_1_0_zaklad";

async function freshDb() {
  const { pg } = await createMigratedDb(LAST_SKLAD_MIGRATION);
  return pg;
}

describe("vat_confirmed reset — reálná Postgres sémantika (post-audit bod A)", () => {
  it("re-schválení řádku reviewGoodsReceiptLineVat na STEJNOU i JINOU hodnotu NERESETUJE vat_confirmed", async () => {
    const pg = await freshDb();
    const supplierId = randomUUID();
    const locationId = (await pg.query<{ id: string }>(`SELECT id FROM stock_locations LIMIT 1`)).rows[0].id;
    const receiptId = randomUUID();
    const lineId = randomUUID();

    await pg.query(`INSERT INTO suppliers (id, name, name_normalized) VALUES ($1, 'Test', 'test')`, [supplierId]);
    await pg.query(
      `INSERT INTO goods_receipts (id, supplier_id, supplier_name_snapshot, stock_location_id, status, created_by_user_id)
       VALUES ($1, $2, 'Test', $3, 'draft', 'tester')`,
      [receiptId, supplierId, locationId]
    );
    await pg.query(
      `INSERT INTO goods_receipt_lines
         (id, receipt_id, position, raw_description, raw_package_quantity, raw_units_per_package, raw_unit,
          normalized_quantity, normalized_unit, unit_price_without_vat,
          total_without_vat_hal, vat_hal, total_with_vat_hal, computed_vat_rate_percent, vat_confirmed, line_kind)
       VALUES ($1, $2, 1, 'Testovací řádek', 1, 1, 'ks', 1, 'ks', 100, 10000, 2100, 12100, 21, false, 'non_stock_private')`,
      [lineId, receiptId]
    );

    // Exact mirror of reviewGoodsReceiptLineVat's SQL in sklad.ts.
    async function review(totalWithoutVatHal: number, totalWithVatHal: number) {
      await pg.query(
        `WITH set_review_flag AS MATERIALIZED (
           SELECT set_config('sklad.vat_review_in_progress', 'true', true)
         )
         UPDATE goods_receipt_lines
         SET total_without_vat_hal = $1,
             vat_hal = $2,
             total_with_vat_hal = $3,
             computed_vat_rate_percent = $4,
             vat_confirmed = true,
             updated_at = now()
         WHERE id = $5 AND receipt_id = $6
           AND EXISTS (SELECT 1 FROM set_review_flag)`,
        [totalWithoutVatHal, totalWithVatHal - totalWithoutVatHal, totalWithVatHal, 21, lineId, receiptId]
      );
    }

    await review(10000, 12100);
    let row = (await pg.query<{ vat_confirmed: boolean }>(`SELECT vat_confirmed FROM goods_receipt_lines WHERE id=$1`, [lineId])).rows[0];
    expect(row.vat_confirmed).toBe(true);

    // Re-schválení se STEJNOU hodnotou true, ale JINÝMI částkami — tohle
    // je přesně případ, kde porovnání NEW/OLD vat_confirmed nic nepoví
    // (obě true). Musí zůstat true.
    await review(9000, 10890);
    row = (await pg.query<{ vat_confirmed: boolean }>(`SELECT vat_confirmed FROM goods_receipt_lines WHERE id=$1`, [lineId])).rows[0];
    expect(row.vat_confirmed).toBe(true);
  }, DB_TEST.timeout);

  it("jakákoli JINÁ změna částek (bez GUC flagu) resetuje vat_confirmed na false", async () => {
    const pg = await freshDb();
    const supplierId = randomUUID();
    const locationId = (await pg.query<{ id: string }>(`SELECT id FROM stock_locations LIMIT 1`)).rows[0].id;
    const receiptId = randomUUID();
    const lineId = randomUUID();

    await pg.query(`INSERT INTO suppliers (id, name, name_normalized) VALUES ($1, 'Test', 'test')`, [supplierId]);
    await pg.query(
      `INSERT INTO goods_receipts (id, supplier_id, supplier_name_snapshot, stock_location_id, status, created_by_user_id)
       VALUES ($1, $2, 'Test', $3, 'draft', 'tester')`,
      [receiptId, supplierId, locationId]
    );
    await pg.query(
      `INSERT INTO goods_receipt_lines
         (id, receipt_id, position, raw_description, raw_package_quantity, raw_units_per_package, raw_unit,
          normalized_quantity, normalized_unit, unit_price_without_vat,
          total_without_vat_hal, vat_hal, total_with_vat_hal, computed_vat_rate_percent, vat_confirmed, line_kind)
       VALUES ($1, $2, 1, 'Testovací řádek', 1, 1, 'ks', 1, 'ks', 100, 10000, 2100, 12100, 21, true, 'non_stock_private')`,
      [lineId, receiptId]
    );

    // Plain update, bez set_config flagu — simuluje budoucí editační cestu,
    // která nepoužije reviewGoodsReceiptLineVat.
    await pg.query(`UPDATE goods_receipt_lines SET raw_package_quantity = 2, normalized_quantity = 2 WHERE id=$1`, [lineId]);
    const row = (await pg.query<{ vat_confirmed: boolean }>(`SELECT vat_confirmed FROM goods_receipt_lines WHERE id=$1`, [lineId])).rows[0];
    expect(row.vat_confirmed).toBe(false);
  }, DB_TEST.timeout);

  it("změna NESOUVISEJÍCÍHO pole (popis) vat_confirmed nemění", async () => {
    const pg = await freshDb();
    const supplierId = randomUUID();
    const locationId = (await pg.query<{ id: string }>(`SELECT id FROM stock_locations LIMIT 1`)).rows[0].id;
    const receiptId = randomUUID();
    const lineId = randomUUID();

    await pg.query(`INSERT INTO suppliers (id, name, name_normalized) VALUES ($1, 'Test', 'test')`, [supplierId]);
    await pg.query(
      `INSERT INTO goods_receipts (id, supplier_id, supplier_name_snapshot, stock_location_id, status, created_by_user_id)
       VALUES ($1, $2, 'Test', $3, 'draft', 'tester')`,
      [receiptId, supplierId, locationId]
    );
    await pg.query(
      `INSERT INTO goods_receipt_lines
         (id, receipt_id, position, raw_description, raw_package_quantity, raw_units_per_package, raw_unit,
          normalized_quantity, normalized_unit, unit_price_without_vat,
          total_without_vat_hal, vat_hal, total_with_vat_hal, computed_vat_rate_percent, vat_confirmed, line_kind)
       VALUES ($1, $2, 1, 'Testovací řádek', 1, 1, 'ks', 1, 'ks', 100, 10000, 2100, 12100, 21, true, 'non_stock_private')`,
      [lineId, receiptId]
    );

    await pg.query(`UPDATE goods_receipt_lines SET raw_description = 'Opravený popis' WHERE id=$1`, [lineId]);
    const row = (await pg.query<{ vat_confirmed: boolean }>(`SELECT vat_confirmed FROM goods_receipt_lines WHERE id=$1`, [lineId])).rows[0];
    expect(row.vat_confirmed).toBe(true);
  }, DB_TEST.timeout);
});

describe("SHA-256 duplicitní ochrana — reálná Postgres sémantika (post-audit bod B)", () => {
  async function setupTwoReceipts(pg: Awaited<ReturnType<typeof freshDb>>) {
    const supplierId = randomUUID();
    const locationId = (await pg.query<{ id: string }>(`SELECT id FROM stock_locations LIMIT 1`)).rows[0].id;
    await pg.query(`INSERT INTO suppliers (id, name, name_normalized) VALUES ($1, 'Test', 'test')`, [supplierId]);

    const receiptA = randomUUID();
    const receiptB = randomUUID();
    for (const id of [receiptA, receiptB]) {
      await pg.query(
        `INSERT INTO goods_receipts (id, supplier_id, supplier_name_snapshot, stock_location_id, status, created_by_user_id)
         VALUES ($1, $2, 'Test', $3, 'draft', 'tester')`,
        [id, supplierId, locationId]
      );
    }
    const docA = randomUUID();
    const docB = randomUUID();
    await pg.query(`INSERT INTO goods_receipt_documents (id, receipt_id, kind, uploaded_by_user_id) VALUES ($1,$2,'invoice','tester')`, [docA, receiptA]);
    await pg.query(`INSERT INTO goods_receipt_documents (id, receipt_id, kind, uploaded_by_user_id) VALUES ($1,$2,'invoice','tester')`, [docB, receiptB]);
    return { receiptA, receiptB, docA, docB };
  }

  it("stejný hash do DRUHÉ aktivní (draft) příjemky je odmítnut", async () => {
    const pg = await freshDb();
    const { docA, docB } = await setupTwoReceipts(pg);
    const hash = "a".repeat(64);

    await pg.query(
      `INSERT INTO goods_receipt_document_pages (id, document_id, page_number, storage_key, sha256, mime_type)
       VALUES ($1,$2,1,'key-a',$3,'image/jpeg')`,
      [randomUUID(), docA, hash]
    );

    await expect(
      pg.query(
        `INSERT INTO goods_receipt_document_pages (id, document_id, page_number, storage_key, sha256, mime_type)
         VALUES ($1,$2,1,'key-b',$3,'image/jpeg')`,
        [randomUUID(), docB, hash]
      )
    ).rejects.toThrow(/aktivní/);
  }, DB_TEST.timeout);

  it("stejný hash je odmítnut i vůči už POTVRZENÉ příjemce (ne jen draft-draft)", async () => {
    const pg = await freshDb();
    const { receiptA, docA, docB } = await setupTwoReceipts(pg);
    const hash = "b".repeat(64);

    await pg.query(
      `INSERT INTO goods_receipt_document_pages (id, document_id, page_number, storage_key, sha256, mime_type)
       VALUES ($1,$2,1,'key-a',$3,'image/jpeg')`,
      [randomUUID(), docA, hash]
    );
    await pg.query(`UPDATE goods_receipts SET status='confirmed', confirmed_by_user_id='tester', confirmed_at=now() WHERE id=$1`, [receiptA]);

    await expect(
      pg.query(
        `INSERT INTO goods_receipt_document_pages (id, document_id, page_number, storage_key, sha256, mime_type)
         VALUES ($1,$2,1,'key-b',$3,'image/jpeg')`,
        [randomUUID(), docB, hash]
      )
    ).rejects.toThrow(/aktivní/);
  }, DB_TEST.timeout);

  it("po stornu původní příjemky se hash uvolní a smí se použít znovu", async () => {
    const pg = await freshDb();
    const { receiptA, docA, docB } = await setupTwoReceipts(pg);
    const hash = "c".repeat(64);

    await pg.query(
      `INSERT INTO goods_receipt_document_pages (id, document_id, page_number, storage_key, sha256, mime_type)
       VALUES ($1,$2,1,'key-a',$3,'image/jpeg')`,
      [randomUUID(), docA, hash]
    );
    await pg.query(`UPDATE goods_receipts SET status='confirmed', confirmed_by_user_id='tester', confirmed_at=now() WHERE id=$1`, [receiptA]);
    await pg.query(
      `UPDATE goods_receipts SET status='voided', voided_by_user_id='tester', voided_at=now(), void_reason='test' WHERE id=$1`,
      [receiptA]
    );

    await expect(
      pg.query(
        `INSERT INTO goods_receipt_document_pages (id, document_id, page_number, storage_key, sha256, mime_type)
         VALUES ($1,$2,1,'key-b',$3,'image/jpeg')`,
        [randomUUID(), docB, hash]
      )
    ).resolves.toBeDefined();
  }, DB_TEST.timeout);

  it("confirm-time guard trigger (defense-in-depth): blokuje potvrzení, i kdyby duplicita vznikla jinou cestou než app INSERTem", async () => {
    const pg = await freshDb();
    const { receiptA, receiptB, docA, docB } = await setupTwoReceipts(pg);
    const hash = "d".repeat(64);

    // Simulace "duplicita vznikla jinou cestou" (např. budoucí hromadný
    // import) — vypneme na moment page-insert trigger, aby vznikl stav,
    // který by appka za normálních okolností nikdy nevytvořila.
    await pg.query(`ALTER TABLE goods_receipt_document_pages DISABLE TRIGGER goods_receipt_document_pages_unique_active_sha256`);
    await pg.query(
      `INSERT INTO goods_receipt_document_pages (id, document_id, page_number, storage_key, sha256, mime_type)
       VALUES ($1,$2,1,'key-a',$3,'image/jpeg')`,
      [randomUUID(), docA, hash]
    );
    await pg.query(
      `INSERT INTO goods_receipt_document_pages (id, document_id, page_number, storage_key, sha256, mime_type)
       VALUES ($1,$2,1,'key-b',$3,'image/jpeg')`,
      [randomUUID(), docB, hash]
    );
    await pg.query(`ALTER TABLE goods_receipt_document_pages ENABLE TRIGGER goods_receipt_document_pages_unique_active_sha256`);

    // Teď obě příjemky (A, B) mají aktivní (draft) stránku se stejným
    // hashem — stav, který by za normálních okolností nikdy nevznikl.
    // Potvrzení A musí confirm-time guard trigger zablokovat.
    await expect(
      pg.query(`UPDATE goods_receipts SET status='confirmed', confirmed_by_user_id='tester', confirmed_at=now() WHERE id=$1`, [receiptA])
    ).rejects.toThrow(/aktivní/);

    // B zůstává draft, A zůstává draft (update selhal) — žádná z nich se
    // nestala "ostrou" s nevyřešenou duplicitou.
    const statuses = (await pg.query<{ id: string; status: string }>(`SELECT id, status FROM goods_receipts WHERE id IN ($1,$2)`, [receiptA, receiptB])).rows;
    for (const row of statuses) expect(row.status).toBe("draft");
  }, DB_TEST.timeout);
});
