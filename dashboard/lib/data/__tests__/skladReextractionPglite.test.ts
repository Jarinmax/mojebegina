// "Znovu přečíst doklad" — reálné ověření proti REÁLNÉ Postgres databázi
// (PGlite, stejný vzor jako skladPostAuditPglite.test.ts: createMigratedDb()
// aplikuje migrace tak, jak doopravdy vypadají, žádný mock SQL transportu).
//
// Co TENHLE soubor dokazuje, a mock transport (skladReextraction.test.ts)
// NEMŮŽE: PostgreSQL NEZARUČUJE pořadí mezi sesterskými datově-měnícími
// CTE, pokud na sebe neodkazují jménem — `inserted` v
// acceptGoodsReceiptReextraction (sklad.ts) čte `(SELECT count(*) FROM
// deleted)` právě proto, aby DELETE starých řádků doopravdy proběhl PŘED
// INSERTem nových se stejnými (receipt_id, position). Testy níž staví
// starou i novou sadu řádků se STEJNÝMI pozicemi (1, 2) — bez vynucené
// závislosti by tohle spadlo na unique index "goods_receipt_lines_position_key".
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMigratedDb } from "../../eshop/__tests__/helpers/migratedDb";

const DB_TEST = { timeout: 60_000 };
const LAST_MIGRATION = "0024_phase_22_sklad_1_0_znovu_precist";

async function freshDb() {
  const { pg } = await createMigratedDb(LAST_MIGRATION);
  return pg;
}

async function setupDraftReceiptWithLines(pg: Awaited<ReturnType<typeof freshDb>>, lineCount: number) {
  const supplierId = randomUUID();
  const locationId = (await pg.query<{ id: string }>(`SELECT id FROM stock_locations LIMIT 1`)).rows[0].id;
  const receiptId = randomUUID();

  await pg.query(`INSERT INTO suppliers (id, name, name_normalized) VALUES ($1, 'Test', 'test')`, [supplierId]);
  await pg.query(
    `INSERT INTO goods_receipts (id, supplier_id, supplier_name_snapshot, stock_location_id, status, created_by_user_id)
     VALUES ($1, $2, 'Test', $3, 'draft', 'tester')`,
    [receiptId, supplierId, locationId]
  );
  for (let position = 1; position <= lineCount; position += 1) {
    await pg.query(
      `INSERT INTO goods_receipt_lines
         (id, receipt_id, position, raw_description, raw_package_quantity, raw_units_per_package, raw_unit,
          normalized_quantity, normalized_unit, unit_price_without_vat,
          total_without_vat_hal, vat_hal, total_with_vat_hal, computed_vat_rate_percent, vat_confirmed, line_kind)
       VALUES ($1, $2, $3, $4, 1, 1, 'ks', 1, 'ks', 100, 10000, 2100, 12100, 21, true, 'non_stock_private')`,
      [randomUUID(), receiptId, position, `Původní řádek ${position}`]
    );
  }
  return { receiptId, supplierId };
}

// Exact mirror of acceptGoodsReceiptReextraction's SQL in sklad.ts.
async function acceptReextraction(
  pg: Awaited<ReturnType<typeof freshDb>>,
  receiptId: string,
  linesJson: string,
  candidates: { supplierId: string | null; supplierName: string | null; documentNumber: string | null; documentDate: string | null; paymentMethod: string | null }
) {
  return pg.query<{ id: string }>(
    `WITH claimed AS (
        UPDATE goods_receipts
        SET extraction_status = 'needs_review',
            reextraction_status = 'none',
            reextraction_raw = NULL,
            reextraction_claimed_at = NULL,
            supplier_id = COALESCE($2::uuid, supplier_id),
            supplier_name_snapshot = COALESCE($3, supplier_name_snapshot),
            document_number = COALESCE(document_number, $4),
            document_date = COALESCE(document_date, $5::date),
            payment_method = COALESCE(payment_method, $6),
            updated_at = now()
        WHERE id = $1 AND status = 'draft' AND reextraction_status = 'ready'
        RETURNING id
      ),
      deleted AS (
        DELETE FROM goods_receipt_lines
        WHERE receipt_id = $1 AND EXISTS (SELECT 1 FROM claimed)
        RETURNING id
      ),
      new_lines AS (
        SELECT * FROM jsonb_to_recordset($7::jsonb) AS t(
          position int, raw_description text, supplier_item_code text, supplier_auxiliary_code text,
          raw_package_quantity numeric, raw_units_per_package numeric, raw_unit text,
          normalized_quantity numeric, normalized_unit text, unit_price_without_vat numeric,
          total_without_vat_hal bigint, vat_hal bigint, total_with_vat_hal bigint,
          computed_vat_rate_percent numeric, stock_item_id uuid, line_kind text, mapping_source text
        )
      ),
      inserted AS (
        INSERT INTO goods_receipt_lines (
          receipt_id, position, raw_description, supplier_item_code, supplier_auxiliary_code,
          raw_package_quantity, raw_units_per_package, raw_unit, normalized_quantity, normalized_unit,
          unit_price_without_vat, total_without_vat_hal, vat_hal, total_with_vat_hal,
          computed_vat_rate_percent, vat_confirmed, stock_item_id, line_kind, mapping_source
        )
        SELECT $1, nl.position, nl.raw_description, nl.supplier_item_code, nl.supplier_auxiliary_code,
               nl.raw_package_quantity, nl.raw_units_per_package, nl.raw_unit, nl.normalized_quantity, nl.normalized_unit,
               nl.unit_price_without_vat, nl.total_without_vat_hal, nl.vat_hal, nl.total_with_vat_hal,
               nl.computed_vat_rate_percent, false, nl.stock_item_id, nl.line_kind, nl.mapping_source
        FROM new_lines nl, (SELECT count(*) AS n FROM deleted) AS delete_guard
        WHERE EXISTS (SELECT 1 FROM claimed)
        RETURNING id
      )
      INSERT INTO goods_receipt_activity (receipt_id, actor_type, author_user_id, author_name, kind, body)
      SELECT $1, 'user', 'tester', 'Test', 'lines_replaced_by_reextraction',
             'Převzat výsledek nového čtení — ' || (SELECT count(*) FROM deleted) || ' původních řádků nahrazeno ' || (SELECT count(*) FROM inserted) || ' novými.'
      WHERE EXISTS (SELECT 1 FROM claimed)
      RETURNING id`,
    [receiptId, candidates.supplierId, candidates.supplierName, candidates.documentNumber, candidates.documentDate, candidates.paymentMethod, linesJson]
  );
}

function newLinesJson(count: number): string {
  return JSON.stringify(
    Array.from({ length: count }, (_, i) => ({
      position: i + 1,
      raw_description: `Nový řádek ${i + 1}`,
      supplier_item_code: null,
      supplier_auxiliary_code: null,
      raw_package_quantity: 1,
      raw_units_per_package: 1,
      raw_unit: "ks",
      normalized_quantity: 1,
      normalized_unit: "ks",
      unit_price_without_vat: 50,
      total_without_vat_hal: 5000,
      vat_hal: 1050,
      total_with_vat_hal: 6050,
      computed_vat_rate_percent: 21,
      stock_item_id: null,
      line_kind: "non_stock_private",
      mapping_source: null,
    }))
  );
}

describe("acceptGoodsReceiptReextraction — reálná Postgres sémantika pro DELETE→INSERT stejných pozic", () => {
  it("staré řádky (pozice 1,2) i nové řádky (pozice 1,2) se STEJNÝMI pozicemi — bez unique violation, výsledek jsou JEN nové řádky", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 2);
    await pg.query(`UPDATE goods_receipts SET reextraction_status = 'ready' WHERE id = $1`, [receiptId]);

    const result = await acceptReextraction(pg, receiptId, newLinesJson(2), {
      supplierId: null,
      supplierName: null,
      documentNumber: null,
      documentDate: null,
      paymentMethod: null,
    });
    expect(result.rows).toHaveLength(1); // activity insert RETURNING id

    const lines = (
      await pg.query<{ position: number; raw_description: string }>(
        `SELECT position, raw_description FROM goods_receipt_lines WHERE receipt_id = $1 ORDER BY position`,
        [receiptId]
      )
    ).rows;
    expect(lines).toEqual([
      { position: 1, raw_description: "Nový řádek 1" },
      { position: 2, raw_description: "Nový řádek 2" },
    ]);

    const receipt = (
      await pg.query<{ status: string; extraction_status: string; reextraction_status: string; reextraction_raw: unknown }>(
        `SELECT status, extraction_status, reextraction_status, reextraction_raw FROM goods_receipts WHERE id = $1`,
        [receiptId]
      )
    ).rows[0];
    expect(receipt.status).toBe("draft");
    expect(receipt.extraction_status).toBe("needs_review");
    expect(receipt.reextraction_status).toBe("none");
    expect(receipt.reextraction_raw).toBeNull();
  }, DB_TEST.timeout);

  it("méně nových řádků (1) než starých (3, stejné pozice 1) — staré 2,3 zmizí, zbyde jen nová 1", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 3);
    await pg.query(`UPDATE goods_receipts SET reextraction_status = 'ready' WHERE id = $1`, [receiptId]);

    await acceptReextraction(pg, receiptId, newLinesJson(1), {
      supplierId: null,
      supplierName: null,
      documentNumber: null,
      documentDate: null,
      paymentMethod: null,
    });

    const lines = (await pg.query<{ position: number }>(`SELECT position FROM goods_receipt_lines WHERE receipt_id = $1`, [receiptId])).rows;
    expect(lines).toEqual([{ position: 1 }]);
  }, DB_TEST.timeout);

  it("příjemka NENÍ 'ready' (jen 'pending') → claim neprojde, PŮVODNÍ řádky zůstávají úplně beze změny", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 2);
    await pg.query(`UPDATE goods_receipts SET reextraction_status = 'pending' WHERE id = $1`, [receiptId]);

    const result = await acceptReextraction(pg, receiptId, newLinesJson(2), {
      supplierId: null,
      supplierName: null,
      documentNumber: null,
      documentDate: null,
      paymentMethod: null,
    });
    expect(result.rows).toHaveLength(0);

    const lines = (
      await pg.query<{ position: number; raw_description: string }>(
        `SELECT position, raw_description FROM goods_receipt_lines WHERE receipt_id = $1 ORDER BY position`,
        [receiptId]
      )
    ).rows;
    expect(lines).toEqual([
      { position: 1, raw_description: "Původní řádek 1" },
      { position: 2, raw_description: "Původní řádek 2" },
    ]);
  }, DB_TEST.timeout);

  it("potvrzená příjemka ('confirmed') → appka ji nikdy nezmění, i kdyby reextraction_status byl 'ready'", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 1);
    await pg.query(
      `UPDATE goods_receipts SET reextraction_status = 'ready', status = 'confirmed', confirmed_by_user_id = 'tester', confirmed_at = now(),
         total_without_vat_hal = 10000, total_vat_hal = 2100, total_with_vat_hal = 12100
       WHERE id = $1`,
      [receiptId]
    );

    const result = await acceptReextraction(pg, receiptId, newLinesJson(1), {
      supplierId: null,
      supplierName: null,
      documentNumber: null,
      documentDate: null,
      paymentMethod: null,
    });
    expect(result.rows).toHaveLength(0);

    const line = (await pg.query<{ raw_description: string }>(`SELECT raw_description FROM goods_receipt_lines WHERE receipt_id = $1`, [receiptId])).rows[0];
    expect(line.raw_description).toBe("Původní řádek 1");
  }, DB_TEST.timeout);

  it("kandidát dodavatele/hlavičky se promítne jen při přijetí, a jen tam, kde byla hlavička prázdná", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 1);
    const newSupplierId = randomUUID();
    await pg.query(`INSERT INTO suppliers (id, name, name_normalized) VALUES ($1, 'Nový dodavatel', 'novy dodavatel')`, [newSupplierId]);
    await pg.query(`UPDATE goods_receipts SET reextraction_status = 'ready' WHERE id = $1`, [receiptId]);

    await acceptReextraction(pg, receiptId, newLinesJson(1), {
      supplierId: newSupplierId,
      supplierName: "Nový dodavatel",
      documentNumber: "FV-123",
      documentDate: "2026-10-11",
      paymentMethod: "hotově",
    });

    const receipt = (
      await pg.query<{ supplier_id: string; supplier_name_snapshot: string; document_number: string; payment_method: string }>(
        `SELECT supplier_id, supplier_name_snapshot, document_number, payment_method FROM goods_receipts WHERE id = $1`,
        [receiptId]
      )
    ).rows[0];
    expect(receipt.supplier_id).toBe(newSupplierId);
    expect(receipt.supplier_name_snapshot).toBe("Nový dodavatel");
    expect(receipt.document_number).toBe("FV-123");
    expect(receipt.payment_method).toBe("hotově");
  }, DB_TEST.timeout);
});

describe("discardGoodsReceiptReextraction — reálná Postgres sémantika", () => {
  it("'ready' → reset na 'none', goods_receipt_lines beze změny", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 2);
    await pg.query(`UPDATE goods_receipts SET reextraction_status = 'ready', reextraction_raw = '{}'::jsonb WHERE id = $1`, [receiptId]);

    // Exact mirror of discardGoodsReceiptReextraction's SQL in sklad.ts.
    const result = await pg.query<{ id: string }>(
      `UPDATE goods_receipts
       SET reextraction_status = 'none', reextraction_raw = NULL, reextraction_claimed_at = NULL, updated_at = now()
       WHERE id = $1 AND status = 'draft' AND reextraction_status IN ('ready', 'failed')
       RETURNING id`,
      [receiptId]
    );
    expect(result.rows).toHaveLength(1);

    const receipt = (await pg.query<{ reextraction_status: string; reextraction_raw: unknown }>(`SELECT reextraction_status, reextraction_raw FROM goods_receipts WHERE id = $1`, [receiptId])).rows[0];
    expect(receipt.reextraction_status).toBe("none");
    expect(receipt.reextraction_raw).toBeNull();

    const lineCount = (await pg.query<{ count: string }>(`SELECT count(*) FROM goods_receipt_lines WHERE receipt_id = $1`, [receiptId])).rows[0].count;
    expect(Number(lineCount)).toBe(2);
  }, DB_TEST.timeout);
});
