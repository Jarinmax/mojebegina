// Security Phase 22 (Sklad 1.0 — bezpečný základ) — statická kontrola
// migrace 0023 proti tiché regresi (někdo omylem smaže/pozmění pojistku
// při pozdější úpravě souboru). Stejná konvence jako
// dailyCallsValidation.test.ts ("ověřit na zkompilovaném SQL textu") —
// NENÍ náhrada za reálné ověření proti živé Postgres databázi (triggery,
// CHECKy a partial unique indexy se spustí a vynutí doopravdy jen tam);
// migrace se v téhle fázi explicitně NESPOUŠTÍ (zadání: "žádná migrace
// proti Preview ani Production").
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(__dirname, "../../../drizzle/0023_phase_22_sklad_1_0_zaklad.sql"),
  "utf-8"
);

describe("migrace 0023 — databázové pojistky (revize návrhu)", () => {
  it("bod 1: skladové lokace existují a MVP má seedovanou výchozí lokaci", () => {
    expect(migrationSql).toContain('CREATE TABLE "stock_locations"');
    expect(migrationSql).toContain("INSERT INTO stock_locations (code, name) VALUES ('default'");
  });

  it("bod 1: pohled na zůstatek je per (stock_item_id, stock_location_id), nikdy jen globálně", () => {
    expect(migrationSql).toContain("CREATE VIEW stock_item_balances AS");
    expect(migrationSql).toContain("GROUP BY m.stock_item_id, m.stock_location_id");
  });

  it("bod 2: dodavatelé mají IČO jako silný identifikátor (unikátní, pokud vyplněné) a normalizovaný název jen jako fallback", () => {
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "suppliers_ico_key"');
    expect(migrationSql).toContain('WHERE "suppliers"."ico" IS NOT NULL');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "suppliers_name_normalized_key"');
    expect(migrationSql).toContain('WHERE "suppliers"."ico" IS NULL');
  });

  it("bod 3: jedna příjemka může mít víc dokumentů (vazba vede OD dokumentu NA příjemku)", () => {
    expect(migrationSql).toMatch(/"goods_receipt_documents"[\s\S]*"receipt_id"/);
    expect(migrationSql).toContain(
      'ALTER TABLE "goods_receipt_documents" ADD CONSTRAINT "goods_receipt_documents_receipt_id_goods_receipts_id_fk"'
    );
  });

  it("bod 4: neznámý dodavatelský kód (např. Makro 23/6) se nikdy nepoužije jako DPH ani jako hlavní klíč mapování", () => {
    expect(migrationSql).toContain('"supplier_auxiliary_code" text');
    expect(migrationSql).toContain('CONSTRAINT "supplier_item_mappings_has_key"');
  });

  it("bod 5: řádek má odděleně syrové i normalizované množství a vždy DOPOČÍTANOU sazbu DPH", () => {
    expect(migrationSql).toContain('"raw_package_quantity"');
    expect(migrationSql).toContain('"raw_units_per_package"');
    expect(migrationSql).toContain('"normalized_quantity"');
    expect(migrationSql).toContain('"computed_vat_rate_percent"');
    expect(migrationSql).toContain("goods_receipt_lines_total_consistent");
  });

  it("bod 6/post-audit bod 7: stejný SHA-256 nesmí existovat mezi stránkami dvou aktivních příjemek — draft I confirmed, jen voided vyloučené, DB trigger ne jen index", () => {
    expect(migrationSql).toContain("CREATE FUNCTION goods_receipt_document_pages_unique_active_sha256()");
    expect(migrationSql).toContain("CREATE TRIGGER goods_receipt_document_pages_unique_active_sha256");
    expect(migrationSql).toContain("r.status IN ('draft', 'confirmed')");
  });

  it("bod 6: omylem dvojí potvrzení stejného dokladu (supplier_id + document_number) je blokováno na DB úrovni", () => {
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "goods_receipts_confirmed_document_once_key"');
    expect(migrationSql).toContain("WHERE \"goods_receipts\".\"status\" = 'confirmed'");
  });

  it("bod 7: storno nikdy nemaže/nepřepisuje pohyb — korekce je nová řádka s povinným důvodem", () => {
    expect(migrationSql).toContain('"corrects_movement_id"');
    expect(migrationSql).toContain("stock_movements_correction_has_reason");
    expect(migrationSql).toContain("stock_movements_not_self_corrected");
  });

  it("bod 7: dvojí storno stejného pohybu je blokováno na DB úrovni (partial unique index)", () => {
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "stock_movements_corrects_once_key"');
    expect(migrationSql).toContain('WHERE "stock_movements"."corrects_movement_id" IS NOT NULL');
  });

  it("migrace je v journalu zaregistrovaná jako 0023 (první skladová migrace)", () => {
    const journal = JSON.parse(
      readFileSync(join(__dirname, "../../../drizzle/meta/_journal.json"), "utf-8")
    ) as { entries: Array<{ idx: number; tag: string }> };
    const entry = journal.entries.find((e) => e.tag === "0023_phase_22_sklad_1_0_zaklad");
    expect(entry?.idx).toBe(23);
    expect(journal.entries[journal.entries.length - 1].idx).toBe(23);
  });
});
