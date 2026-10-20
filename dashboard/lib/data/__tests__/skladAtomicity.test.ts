// @vitest-environment node
//
// Security Phase 22 (Sklad 1.0 — bezpečný základ) — stejná mock technika
// jako dailyCallsLogOutcomeAtomicity.test.ts (stub "server-only", nahradit
// @neondatabase/serverless transport špionem) — cílí na confirmGoodsReceipt
// a voidGoodsReceipt SAMY (skutečné funkce, ne jen text zkompilovaného SQL
// — to ověřuje skladMigration.test.ts/skladValidation.test.ts už jinak).
//
// Co tenhle test dokazuje: tvar volání potvrzení/storna (zámek příjemky a
// jediný příkaz v téže transakci) a GUC flag revize DPH. Chování nad
// skutečnou DB ověřuje skladFlow.integration.test.ts.
//
// Co tenhle test NEMŮŽE dokázat: skutečné vynucení CHECKů/partial unique
// indexů/triggeru živou Postgres databází — to zůstává zdokumentované
// omezení (stejné jako u dailyCallsLogOutcomeAtomicity.test.ts), migrace
// se v téhle fázi explicitně nespouští proti žádné databázi.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../types";

vi.mock("server-only", () => ({}));

type CapturedQuery = { sql: string; params: unknown[] };
const capturedQueries: CapturedQuery[] = [];

const RECEIPT_ID = "33333333-3333-3333-3333-333333333333";
const SUPPLIER_ID = "44444444-4444-4444-4444-444444444444";
const LOCATION_ID = "55555555-5555-5555-5555-555555555555";

// Řídí odpověď na SELECT "id", "status", "supplier_id", "document_number",
// "stock_location_id" FROM goods_receipts (fetchReceiptForMutation).
let receiptRow: unknown[] | null = ["draft", SUPPLIER_ID, null, LOCATION_ID];
// Řídí odpověď na SELECT … FROM goods_receipt_lines (jen confirmGoodsReceipt).
// Pořadí sloupců: id, line_kind, stock_item_id, raw_description, vat_confirmed.
let lineRows: unknown[][] = [["line-1", "stock_material", "item-1", "Testovací řádek", true]];
// Řídí, kolik řádků vrátí HLAVNÍ atomický příkaz (claimed CTE) — 0 =
// prohraný/souběžný claim, 1 = úspěch.
let claimedRowCount = 1;
// Řídí odpověď na UPDATE z reviewGoodsReceiptLineVat (set_review_flag CTE).
let reviewUpdateRowCount = 1;

vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    const client = (sqlText: string, params: unknown[]) => {
      capturedQueries.push({ sql: sqlText, params });

    if (sqlText.includes('"id", "status", "supplier_id", "document_number", "stock_location_id"')) {
      if (!receiptRow) {
        return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
      }
      return Promise.resolve({ rows: [[RECEIPT_ID, ...receiptRow]], rowCount: 1, fields: [] });
    }
    if (sqlText.startsWith("select") && sqlText.includes('from "goods_receipt_lines"') && !sqlText.includes("WITH")) {
      return Promise.resolve({ rows: lineRows, rowCount: lineRows.length, fields: [] });
    }
    // Předběžná kontrola duplicitního dokladu (jen když je document_number
    // vyplněný) — v těchto testech vždy "žádný duplikát".
    if (sqlText.startsWith("select") && sqlText.includes('from "goods_receipts"') && sqlText.includes("<>")) {
      return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
    }
    if (sqlText.includes("WITH claimed AS")) {
      const rows = claimedRowCount > 0 ? [{ id: "activity-row-id" }] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    if (sqlText.includes("set_review_flag")) {
      const rows = reviewUpdateRowCount > 0 ? [{ id: "line-1" }] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
      return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
    };
    // db.batch() → NeonHttpSession.batch() volá this.client.transaction(…) —
    // builtQueries je v tomhle bodě už pole PROMISŮ (stejný mock client()
    // výš se zavolal jednotlivě pro KAŽDÝ dotaz dávky ještě PŘED tímhle
    // voláním), takže mock jen čeká, až se všechny vyřeší, ve stejném
    // pořadí (stejná konvence jako skutečný @neondatabase/serverless —
    // viz komentář u buildGoodsReceiptAdvisoryLockQuery, sklad.ts).
    client.transaction = (queries: unknown[]) => Promise.all(queries);
    return client;
  },
}));

const mockGetAuthContext = vi.fn<() => Promise<AuthContext>>();
vi.mock("../authContext", () => ({ getAuthContext: () => mockGetAuthContext() }));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";

function confirmCtx(): AuthContext {
  return {
    userId: VINER,
    systemRole: "ADMIN",
    grantedRoles: ["ADMIN"],
    roleSelectionRequired: false,
    name: "Jaroslav Viner",
    email: "viner@example.com",
  };
}

beforeEach(() => {
  capturedQueries.length = 0;
  receiptRow = ["draft", SUPPLIER_ID, null, LOCATION_ID];
  lineRows = [["line-1", "stock_material", "item-1", "Testovací řádek", true]];
  claimedRowCount = 1;
  reviewUpdateRowCount = 1;
  mockGetAuthContext.mockReset();
  mockGetAuthContext.mockResolvedValue(confirmCtx());
});

// Chování potvrzení a storna (kontroly, varování, jediný pohyb, druhé
// potvrzení/storno nic nezdvojí) ověřuje skladFlow.integration.test.ts nad
// skutečnou databází. Tady jen tvar volání: zámek příjemky je první příkaz
// TÉŽE dávky (transakce) a kontroly jsou v TÉMŽE příkazu jako zápis.
describe("confirmGoodsReceipt — zámek a kontroly v jedné transakci", () => {
  it("zámek příjemky → jediný příkaz s kontrolami (verdict), claimem, pohyby a historií; žádný předběžný SELECT řádků", async () => {
    const { confirmGoodsReceipt } = await import("../sklad");
    await confirmGoodsReceipt(RECEIPT_ID, { acknowledgedWarnings: [] });

    const lockIdx = capturedQueries.findIndex((q) => q.sql.includes("pg_advisory_xact_lock"));
    const atomicIdx = capturedQueries.findIndex((q) => q.sql.includes("claimed AS"));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(atomicIdx).toBe(lockIdx + 1);
    const atomic = capturedQueries[atomicIdx].sql;
    expect(atomic).toContain("verdict AS");
    expect(atomic).toMatch(/WHERE id = \$\d+\s+AND status = 'draft'\s+AND \(SELECT cardinality\(v\.blockers\) = 0/);
    expect(atomic).toContain("WHERE l.line_kind <> 'non_stock_private'");
    expect(atomic).toContain("FROM claimed c");
    expect(capturedQueries.some((q) => q.sql.startsWith("select") && q.sql.includes('from "goods_receipt_lines"'))).toBe(false);
  });
});

describe("voidGoodsReceipt — povinný důvod a zámek", () => {
  it("prázdný důvod je odmítnutý BEZ jakéhokoli SQL dotazu", async () => {
    const { voidGoodsReceipt } = await import("../sklad");
    const result = await voidGoodsReceipt(RECEIPT_ID, "   ");
    expect(result.ok).toBe(false);
    expect(capturedQueries.length).toBe(0);
  });

  it("zámek příjemky → jediný příkaz: claim jen z 'confirmed', opačné pohyby jen pro dosud neopravené", async () => {
    const { voidGoodsReceipt } = await import("../sklad");
    await voidGoodsReceipt(RECEIPT_ID, "omylem zadáno 2x");

    const lockIdx = capturedQueries.findIndex((q) => q.sql.includes("pg_advisory_xact_lock"));
    const atomicIdx = capturedQueries.findIndex((q) => q.sql.includes("WITH claimed AS"));
    expect(atomicIdx).toBe(lockIdx + 1);
    const atomic = capturedQueries[atomicIdx].sql;
    expect(atomic).toMatch(/WHERE id = \$\d+ AND status = 'confirmed'/);
    expect(atomic).toContain("m.corrects_movement_id IS NULL");
    expect(atomic).toContain("NOT EXISTS (SELECT 1 FROM stock_movements x WHERE x.corrects_movement_id = m.id)");
  });
});

describe("reviewGoodsReceiptLineVat — GUC flag v témže statementu (post-implementační audit, bod A)", () => {
  it("příjemka, která není 'draft', je odmítnuta ještě PŘED UPDATEm", async () => {
    receiptRow = ["confirmed", SUPPLIER_ID, null, LOCATION_ID];
    const { reviewGoodsReceiptLineVat } = await import("../sklad");

    const result = await reviewGoodsReceiptLineVat(RECEIPT_ID, "line-1", {
      totalWithoutVatHal: "100,00",
      totalWithVatHal: "121,00",
    });

    expect(result.ok).toBe(false);
    expect(capturedQueries.some((q) => q.sql.includes("set_review_flag"))).toBe(false);
  });

  it("neplatný vstup (s DPH nižší než bez DPH) je odmítnut ještě PŘED UPDATEm", async () => {
    const { reviewGoodsReceiptLineVat } = await import("../sklad");

    const result = await reviewGoodsReceiptLineVat(RECEIPT_ID, "line-1", {
      totalWithoutVatHal: "200,00",
      totalWithVatHal: "100,00",
    });

    expect(result.ok).toBe(false);
    expect(capturedQueries.some((q) => q.sql.includes("set_review_flag"))).toBe(false);
  });

  it("úspěch: UPDATE nastaví GUC flag v TÉMŽE statementu (MATERIALIZED CTE) před zápisem vat_confirmed=true", async () => {
    const { reviewGoodsReceiptLineVat } = await import("../sklad");

    const result = await reviewGoodsReceiptLineVat(RECEIPT_ID, "line-1", {
      totalWithoutVatHal: "177,00",
      totalWithVatHal: "214,17",
    });

    expect(result.ok).toBe(true);
    const call = capturedQueries.find((q) => q.sql.includes("set_review_flag"))!;
    expect(call).toBeTruthy();
    expect(call.sql).toContain("AS MATERIALIZED");
    expect(call.sql).toContain("set_config('sklad.vat_review_in_progress', 'true', true)");
    expect(call.sql).toContain("vat_confirmed = true");
    expect(call.sql.indexOf("set_review_flag")).toBeLessThan(call.sql.indexOf("vat_confirmed = true"));
  });

  it("řádek nenalezen (0 řádků z UPDATEu) → {ok:false}", async () => {
    reviewUpdateRowCount = 0;
    const { reviewGoodsReceiptLineVat } = await import("../sklad");

    const result = await reviewGoodsReceiptLineVat(RECEIPT_ID, "line-1", {
      totalWithoutVatHal: "177,00",
      totalWithVatHal: "214,17",
    });

    expect(result.ok).toBe(false);
  });
});
