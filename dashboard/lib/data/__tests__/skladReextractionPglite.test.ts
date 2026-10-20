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
const LAST_MIGRATION = "0024_sklad_1_0_znovu_precist";

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

async function captureLinesSnapshot(pg: Awaited<ReturnType<typeof freshDb>>, receiptId: string) {
  const row = (
    await pg.query<{ count: string; max_updated_at: string | null }>(
      `SELECT count(*) AS count, max(updated_at)::text AS max_updated_at FROM goods_receipt_lines WHERE receipt_id = $1`,
      [receiptId]
    )
  ).rows[0];
  return { count: Number(row.count), maxUpdatedAtText: row.max_updated_at };
}

// Exact mirror of acceptGoodsReceiptReextraction's SQL in sklad.ts — including
// the lines-snapshot guard (ochrana ručních úprav provedených BĚHEM nového
// čtení, zadání) directly inside the `claimed` CTE's WHERE.
async function acceptReextraction(
  pg: Awaited<ReturnType<typeof freshDb>>,
  receiptId: string,
  linesJson: string,
  candidates: { supplierId: string | null; supplierName: string | null; documentNumber: string | null; documentDate: string | null; paymentMethod: string | null },
  linesSnapshot: { count: number; maxUpdatedAtText: string | null }
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
          AND (SELECT count(*) FROM goods_receipt_lines WHERE receipt_id = $1) = $8
          AND (SELECT max(updated_at)::text FROM goods_receipt_lines WHERE receipt_id = $1) IS NOT DISTINCT FROM $9
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
    [
      receiptId,
      candidates.supplierId,
      candidates.supplierName,
      candidates.documentNumber,
      candidates.documentDate,
      candidates.paymentMethod,
      linesJson,
      linesSnapshot.count,
      linesSnapshot.maxUpdatedAtText,
    ]
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
    const linesSnapshot = await captureLinesSnapshot(pg, receiptId);
    await pg.query(`UPDATE goods_receipts SET reextraction_status = 'ready' WHERE id = $1`, [receiptId]);

    const result = await acceptReextraction(
      pg,
      receiptId,
      newLinesJson(2),
      { supplierId: null, supplierName: null, documentNumber: null, documentDate: null, paymentMethod: null },
      linesSnapshot
    );
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
    const linesSnapshot = await captureLinesSnapshot(pg, receiptId);
    await pg.query(`UPDATE goods_receipts SET reextraction_status = 'ready' WHERE id = $1`, [receiptId]);

    await acceptReextraction(
      pg,
      receiptId,
      newLinesJson(1),
      { supplierId: null, supplierName: null, documentNumber: null, documentDate: null, paymentMethod: null },
      linesSnapshot
    );

    const lines = (await pg.query<{ position: number }>(`SELECT position FROM goods_receipt_lines WHERE receipt_id = $1`, [receiptId])).rows;
    expect(lines).toEqual([{ position: 1 }]);
  }, DB_TEST.timeout);

  it("příjemka NENÍ 'ready' (jen 'pending') → claim neprojde, PŮVODNÍ řádky zůstávají úplně beze změny", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 2);
    const linesSnapshot = await captureLinesSnapshot(pg, receiptId);
    await pg.query(`UPDATE goods_receipts SET reextraction_status = 'pending' WHERE id = $1`, [receiptId]);

    const result = await acceptReextraction(
      pg,
      receiptId,
      newLinesJson(2),
      { supplierId: null, supplierName: null, documentNumber: null, documentDate: null, paymentMethod: null },
      linesSnapshot
    );
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
    const linesSnapshot = await captureLinesSnapshot(pg, receiptId);
    await pg.query(
      `UPDATE goods_receipts SET reextraction_status = 'ready', status = 'confirmed', confirmed_by_user_id = 'tester', confirmed_at = now(),
         total_without_vat_hal = 10000, total_vat_hal = 2100, total_with_vat_hal = 12100
       WHERE id = $1`,
      [receiptId]
    );

    const result = await acceptReextraction(
      pg,
      receiptId,
      newLinesJson(1),
      { supplierId: null, supplierName: null, documentNumber: null, documentDate: null, paymentMethod: null },
      linesSnapshot
    );
    expect(result.rows).toHaveLength(0);

    const line = (await pg.query<{ raw_description: string }>(`SELECT raw_description FROM goods_receipt_lines WHERE receipt_id = $1`, [receiptId])).rows[0];
    expect(line.raw_description).toBe("Původní řádek 1");
  }, DB_TEST.timeout);

  it("stornovaná příjemka ('voided') → appka ji nikdy nezmění, i kdyby reextraction_status byl 'ready' (ne jen 'confirmed')", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 1);
    const linesSnapshot = await captureLinesSnapshot(pg, receiptId);
    await pg.query(
      `UPDATE goods_receipts SET reextraction_status = 'ready', status = 'voided', voided_by_user_id = 'tester', voided_at = now(), void_reason = 'test'
       WHERE id = $1`,
      [receiptId]
    );

    const result = await acceptReextraction(
      pg,
      receiptId,
      newLinesJson(1),
      { supplierId: null, supplierName: null, documentNumber: null, documentDate: null, paymentMethod: null },
      linesSnapshot
    );
    expect(result.rows).toHaveLength(0);

    const line = (await pg.query<{ raw_description: string }>(`SELECT raw_description FROM goods_receipt_lines WHERE receipt_id = $1`, [receiptId])).rows[0];
    expect(line.raw_description).toBe("Původní řádek 1");
  }, DB_TEST.timeout);

  it("ochrana ručních úprav BĚHEM nového čtení: řádek byl mezitím ručně upraven (jiný updated_at) → claim neprojde, upravený řádek zůstává beze změny appkou", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 2);
    // Snímek se bere PŘED spuštěním nového čtení — simulujeme ruční úpravu
    // existujícího řádku PO snímku (appka tak o ní při čtení nemohla vědět).
    const staleSnapshot = await captureLinesSnapshot(pg, receiptId);
    await pg.query(`UPDATE goods_receipts SET reextraction_status = 'ready' WHERE id = $1`, [receiptId]);
    await pg.query(
      `UPDATE goods_receipt_lines SET raw_description = 'Ručně opravený popis', updated_at = now() WHERE receipt_id = $1 AND position = 1`,
      [receiptId]
    );

    const result = await acceptReextraction(
      pg,
      receiptId,
      newLinesJson(2),
      { supplierId: null, supplierName: null, documentNumber: null, documentDate: null, paymentMethod: null },
      staleSnapshot
    );
    expect(result.rows).toHaveLength(0);

    const lines = (
      await pg.query<{ position: number; raw_description: string }>(
        `SELECT position, raw_description FROM goods_receipt_lines WHERE receipt_id = $1 ORDER BY position`,
        [receiptId]
      )
    ).rows;
    expect(lines).toEqual([
      { position: 1, raw_description: "Ručně opravený popis" }, // ruční oprava zachována
      { position: 2, raw_description: "Původní řádek 2" },
    ]);
  }, DB_TEST.timeout);

  it("ochrana ručních úprav BĚHEM nového čtení: řádek byl mezitím ručně SMAZÁN (jiný počet) → claim neprojde", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 2);
    const staleSnapshot = await captureLinesSnapshot(pg, receiptId);
    await pg.query(`UPDATE goods_receipts SET reextraction_status = 'ready' WHERE id = $1`, [receiptId]);
    await pg.query(`DELETE FROM goods_receipt_lines WHERE receipt_id = $1 AND position = 2`, [receiptId]);

    const result = await acceptReextraction(
      pg,
      receiptId,
      newLinesJson(2),
      { supplierId: null, supplierName: null, documentNumber: null, documentDate: null, paymentMethod: null },
      staleSnapshot
    );
    expect(result.rows).toHaveLength(0);

    const lines = (await pg.query<{ position: number }>(`SELECT position FROM goods_receipt_lines WHERE receipt_id = $1`, [receiptId])).rows;
    expect(lines).toEqual([{ position: 1 }]); // jen zbylý ruční stav, appka nic nepřepsala
  }, DB_TEST.timeout);

  it("kandidát dodavatele/hlavičky se promítne jen při přijetí, a jen tam, kde byla hlavička prázdná", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 1);
    const linesSnapshot = await captureLinesSnapshot(pg, receiptId);
    const newSupplierId = randomUUID();
    await pg.query(`INSERT INTO suppliers (id, name, name_normalized) VALUES ($1, 'Nový dodavatel', 'novy dodavatel')`, [newSupplierId]);
    await pg.query(`UPDATE goods_receipts SET reextraction_status = 'ready' WHERE id = $1`, [receiptId]);

    await acceptReextraction(
      pg,
      receiptId,
      newLinesJson(1),
      { supplierId: newSupplierId, supplierName: "Nový dodavatel", documentNumber: "FV-123", documentDate: "2026-10-11", paymentMethod: "hotově" },
      linesSnapshot
    );

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

describe("triggerGoodsReceiptReextraction — ochrana proti opožděnému výsledku staršího pokusu (reálná Postgres sémantika)", () => {
  // Exact mirror of triggerGoodsReceiptReextraction's claim UPDATE in
  // skladExtraction.ts — `claimedAt` je JS Date, stejný objekt se znovu
  // použije jako gate v claimAttemptReady níž (nikdy se nečte zpátky z DB).
  async function claimAttempt(pg: Awaited<ReturnType<typeof freshDb>>, receiptId: string, claimedAt: Date) {
    return pg.query<{ id: string }>(
      `UPDATE goods_receipts
       SET reextraction_status = 'pending', reextraction_claimed_at = $1, updated_at = now()
       WHERE id = $2
         AND status = 'draft'
         AND (
           reextraction_status IN ('none', 'failed')
           OR (reextraction_status = 'pending' AND reextraction_claimed_at < now() - interval '10 minutes')
         )
       RETURNING id`,
      [claimedAt, receiptId]
    );
  }

  // Exact mirror of the final "ready" write in triggerGoodsReceiptReextraction.
  async function claimAttemptReady(pg: Awaited<ReturnType<typeof freshDb>>, receiptId: string, claimedAt: Date, rawJson: string) {
    return pg.query<{ id: string }>(
      `UPDATE goods_receipts
       SET reextraction_status = 'ready', reextraction_raw = $1::jsonb, updated_at = now()
       WHERE id = $2 AND reextraction_claimed_at = $3
       RETURNING id`,
      [rawJson, receiptId, claimedAt]
    );
  }

  it("starší (opožděný) pokus dokončí AŽ PO novějším — jeho zápis gate nesplní a NEPŘEPÍŠE novější výsledek", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 0);

    // Pokus #1 claimne jako první.
    const claimedAt1 = new Date();
    const claim1 = await claimAttempt(pg, receiptId, claimedAt1);
    expect(claim1.rows).toHaveLength(1);

    // Mezitím (simulace: pokus #1 je neobvykle pomalý — třeba kvůli
    // retry na gateway úrovni) je claim #1 už starší než 10 minut, takže
    // appka povolí NOVÝ pokus #2 — posune claimed_at dopředu.
    await pg.query(`UPDATE goods_receipts SET reextraction_claimed_at = reextraction_claimed_at - interval '11 minutes' WHERE id = $1`, [receiptId]);
    const claimedAt2 = new Date();
    const claim2 = await claimAttempt(pg, receiptId, claimedAt2);
    expect(claim2.rows).toHaveLength(1); // staleness okno dovolilo reclaim

    // Pokus #2 (novější) doběhne první a úspěšně zapíše svůj výsledek.
    const readyFromAttempt2 = await claimAttemptReady(pg, receiptId, claimedAt2, JSON.stringify({ attempt: 2, lines: [] }));
    expect(readyFromAttempt2.rows).toHaveLength(1);

    // Až TEĎ (opožděně) doběhne PŮVODNÍ pokus #1 a zkusí zapsat SVŮJ
    // (starý) výsledek — gate (reextraction_claimed_at = claimedAt1) už
    // nesedí, protože claimAttempt #2 ho přepsal na claimedAt2.
    const readyFromAttempt1 = await claimAttemptReady(pg, receiptId, claimedAt1, JSON.stringify({ attempt: 1, lines: ["STALE"] }));
    expect(readyFromAttempt1.rows).toHaveLength(0); // tiše se nepropsalo

    // Výsledný stav v DB musí být POŘÁD od pokusu #2, ne přepsaný pokusem #1.
    const receipt = (await pg.query<{ reextraction_raw: { attempt: number } }>(`SELECT reextraction_raw FROM goods_receipts WHERE id = $1`, [receiptId])).rows[0];
    expect(receipt.reextraction_raw.attempt).toBe(2);
  }, DB_TEST.timeout);

  it("stejný (jediný) pokus zapíše svůj výsledek normálně — gate claimedAt=claimedAt projde", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 0);

    const claimedAt = new Date();
    await claimAttempt(pg, receiptId, claimedAt);
    const ready = await claimAttemptReady(pg, receiptId, claimedAt, JSON.stringify({ attempt: 1, lines: [] }));
    expect(ready.rows).toHaveLength(1);
  }, DB_TEST.timeout);
});

describe("goods_receipt_lines_bump_updated_at — reálný nález (kontrola před nasazením)", () => {
  it("BEZ triggeru by prostý UPDATE, co nenastaví updated_at explicitně, nechal count+max(updated_at) snímek beze změny (reprodukce díry — ověřeno PŘED přidáním triggeru)", async () => {
    // Tenhle test dokazuje PŮVODNÍ nález: appková konvence (každá funkce si
    // sama nastaví updated_at) NENÍ nic, co by DB sama vynucovala. Proto
    // simulujeme zápis, co na to zapomene, PŘÍMO přes trigger vypnutý —
    // stejná technika jako u SHA-256 triggeru výš (ALTER TABLE ... DISABLE
    // TRIGGER), aby šlo znovu vytvořit přesně ten stav, co appková
    // konvence sama o sobě nikdy nezaručovala.
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 3);
    const before = await captureLinesSnapshot(pg, receiptId);

    await pg.query(`ALTER TABLE goods_receipt_lines DISABLE TRIGGER goods_receipt_lines_bump_updated_at`);
    const lineId = (await pg.query<{ id: string }>(`SELECT id FROM goods_receipt_lines WHERE receipt_id = $1 AND position = 1`, [receiptId])).rows[0].id;
    // Záměrně BEZ "updated_at = now()" — simuluje zápis, co na to zapomněl.
    await pg.query(`UPDATE goods_receipt_lines SET raw_description = 'Ručně upraveno (bez updated_at)' WHERE id = $1`, [lineId]);
    await pg.query(`ALTER TABLE goods_receipt_lines ENABLE TRIGGER goods_receipt_lines_bump_updated_at`);

    const after = await captureLinesSnapshot(pg, receiptId);
    // Reprodukovaná díra: snímek vypadá STEJNĚ, i když se řádek 1 (NE ten s
    // nejnovějším updated_at) ve skutečnosti změnil.
    expect(after).toEqual(before);
  }, DB_TEST.timeout);

  it("SE zapnutým triggerem (normální stav appky): STEJNÝ zápis bez explicitního updated_at se teď detekuje — count/max(updated_at) snímek se změní", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 3);
    const before = await captureLinesSnapshot(pg, receiptId);

    const lineId = (await pg.query<{ id: string }>(`SELECT id FROM goods_receipt_lines WHERE receipt_id = $1 AND position = 1`, [receiptId])).rows[0].id;
    // Stejný zápis jako výš — tentokrát BEZ vypnutí triggeru (normální stav).
    await pg.query(`UPDATE goods_receipt_lines SET raw_description = 'Ručně upraveno' WHERE id = $1`, [lineId]);

    const after = await captureLinesSnapshot(pg, receiptId);
    expect(after).not.toEqual(before);
    expect(after.count).toBe(before.count); // počet stejný, jen obsah/čas se liší
    expect(after.maxUpdatedAtText).not.toBe(before.maxUpdatedAtText);

    const line = (await pg.query<{ raw_description: string }>(`SELECT raw_description FROM goods_receipt_lines WHERE id = $1`, [lineId])).rows[0];
    expect(line.raw_description).toBe("Ručně upraveno"); // obsahová změna se skutečně uložila
  }, DB_TEST.timeout);

  it("trigger nastaví updated_at na 'teď', i kdyby appka poslala explicitní (třeba starou) hodnotu — appková updatedAt je teď jen neškodně nadbytečná", async () => {
    const pg = await freshDb();
    const { receiptId } = await setupDraftReceiptWithLines(pg, 1);
    const lineId = (await pg.query<{ id: string }>(`SELECT id FROM goods_receipt_lines WHERE receipt_id = $1`, [receiptId])).rows[0].id;

    const before = (await pg.query<{ now: string }>(`SELECT now()::text AS now`)).rows[0].now;
    await pg.query(`UPDATE goods_receipt_lines SET raw_description = 'X', updated_at = '2000-01-01T00:00:00Z' WHERE id = $1`, [lineId]);
    const row = (await pg.query<{ updated_at: string }>(`SELECT updated_at::text FROM goods_receipt_lines WHERE id = $1`, [lineId])).rows[0];

    expect(row.updated_at).not.toBe("2000-01-01 00:00:00+00");
    expect(new Date(row.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  }, DB_TEST.timeout);
});
