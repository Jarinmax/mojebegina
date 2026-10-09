// @vitest-environment node
//
// Security Phase 22 (Sklad 1.0 — bezpečný základ) — stejná mock technika
// jako dailyCallsLogOutcomeAtomicity.test.ts (stub "server-only", nahradit
// @neondatabase/serverless transport špionem) — cílí na confirmGoodsReceipt
// a voidGoodsReceipt SAMY (skutečné funkce, ne jen text zkompilovaného SQL
// — to ověřuje skladMigration.test.ts/skladValidation.test.ts už jinak).
//
// Co tenhle test dokazuje na reálných funkcích:
//   - confirmGoodsReceipt: řádek bez potvrzené revize DPH (vat_confirmed
//     false) blokuje potvrzení ještě PŘED atomickým příkazem
//     (post-implementační audit, bod A);
//   - confirmGoodsReceipt: nemapovaný skladový řádek (chybí stock_item_id)
//     blokuje potvrzení ještě PŘED atomickým příkazem (žádný pokus o
//     zápis);
//   - confirmGoodsReceipt: prohraný claim (atomický příkaz vrátí 0 řádků,
//     tj. příjemka mezitím přestala být 'draft') → {ok:false};
//   - confirmGoodsReceipt: úspěšný claim → {ok:true} a atomický příkaz
//     skutečně obsahuje `line_kind <> 'non_stock_private'` (pohyby jen ze
//     skladových/zbožových řádků) a `WHERE EXISTS (SELECT 1 FROM
//     claimed)` na INSERTech (revize návrhu, bod 1 a 7);
//   - voidGoodsReceipt: prázdný důvod je odmítnutý ještě PŘED jakýmkoli
//     dotazem (žádný SQL se nevyšle);
//   - voidGoodsReceipt: prohraný claim → {ok:false};
//   - voidGoodsReceipt: úspěšný claim → atomický příkaz obsahuje `NOT
//     EXISTS (SELECT 1 FROM stock_movements c WHERE c.corrects_movement_id
//     = m.id)` (pojistka proti dvojímu stornu i na úrovni příkazu, ne jen
//     DB indexu — revize návrhu, bod 7).
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
  neon: () => (sqlText: string, params: unknown[]) => {
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

function findAtomicCall() {
  return capturedQueries.find((q) => q.sql.includes("WITH claimed AS"));
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

describe("confirmGoodsReceipt — atomický gate a skladová filtrace (Security Phase 22)", () => {
  it("řádek bez potvrzené revize DPH (vat_confirmed=false) blokuje potvrzení PŘED atomickým příkazem", async () => {
    lineRows = [["line-1", "stock_material", "item-1", "Nerevidovaný řádek", false]];
    const { confirmGoodsReceipt } = await import("../sklad");

    const result = await confirmGoodsReceipt(RECEIPT_ID);

    expect(result.ok).toBe(false);
    expect(findAtomicCall()).toBeFalsy();
  });

  it("nemapovaný skladový řádek (chybí stock_item_id) blokuje potvrzení PŘED atomickým příkazem", async () => {
    lineRows = [["line-1", "stock_material", null, "Nenamapovaná položka", true]];
    const { confirmGoodsReceipt } = await import("../sklad");

    const result = await confirmGoodsReceipt(RECEIPT_ID);

    expect(result.ok).toBe(false);
    expect(findAtomicCall()).toBeFalsy();
  });

  it("prohraný/souběžný claim (0 řádků) → {ok:false}", async () => {
    claimedRowCount = 0;
    const { confirmGoodsReceipt } = await import("../sklad");

    const result = await confirmGoodsReceipt(RECEIPT_ID);

    expect(result.ok).toBe(false);
    expect(findAtomicCall()).toBeTruthy();
  });

  it("úspěšný claim → {ok:true}, pohyby jen z řádků line_kind <> 'non_stock_private', INSERTy gatované na claimed", async () => {
    const { confirmGoodsReceipt } = await import("../sklad");

    const result = await confirmGoodsReceipt(RECEIPT_ID);

    expect(result.ok).toBe(true);
    const atomicCall = findAtomicCall()!;
    expect(atomicCall.sql).toContain("line_kind <> 'non_stock_private'");
    expect(atomicCall.sql).toContain("WHERE EXISTS (SELECT 1 FROM claimed)");
    expect(atomicCall.sql).toMatch(/WHERE id = \$\d+ AND status = 'draft'/);
  });

  it("příjemka, která už není 'draft', je odmítnuta ještě PŘED atomickým příkazem", async () => {
    receiptRow = ["confirmed", SUPPLIER_ID, null, LOCATION_ID];
    const { confirmGoodsReceipt } = await import("../sklad");

    const result = await confirmGoodsReceipt(RECEIPT_ID);

    expect(result.ok).toBe(false);
    expect(findAtomicCall()).toBeFalsy();
  });
});

describe("voidGoodsReceipt — povinný důvod a atomická korekce (Security Phase 22)", () => {
  beforeEach(() => {
    receiptRow = ["confirmed", SUPPLIER_ID, null, LOCATION_ID];
  });

  it("prázdný důvod je odmítnutý BEZ jakéhokoli SQL dotazu", async () => {
    const { voidGoodsReceipt } = await import("../sklad");

    const result = await voidGoodsReceipt(RECEIPT_ID, "   ");

    expect(result.ok).toBe(false);
    expect(capturedQueries.length).toBe(0);
  });

  it("příjemka, která není 'confirmed', je odmítnuta ještě PŘED atomickým příkazem", async () => {
    receiptRow = ["draft", SUPPLIER_ID, null, LOCATION_ID];
    const { voidGoodsReceipt } = await import("../sklad");

    const result = await voidGoodsReceipt(RECEIPT_ID, "omylem");

    expect(result.ok).toBe(false);
    expect(findAtomicCall()).toBeFalsy();
  });

  it("prohraný/souběžný claim (0 řádků) → {ok:false}", async () => {
    claimedRowCount = 0;
    const { voidGoodsReceipt } = await import("../sklad");

    const result = await voidGoodsReceipt(RECEIPT_ID, "omylem zadáno 2x");

    expect(result.ok).toBe(false);
    expect(findAtomicCall()).toBeTruthy();
  });

  it("úspěšný claim → {ok:true}, korekce vylučuje už jednou stornované pohyby (NOT EXISTS), gatováno na claimed", async () => {
    const { voidGoodsReceipt } = await import("../sklad");

    const result = await voidGoodsReceipt(RECEIPT_ID, "omylem zadáno 2x");

    expect(result.ok).toBe(true);
    const atomicCall = findAtomicCall()!;
    expect(atomicCall.sql).toContain("m.corrects_movement_id IS NULL");
    expect(atomicCall.sql).toContain(
      "NOT EXISTS (SELECT 1 FROM stock_movements c WHERE c.corrects_movement_id = m.id)"
    );
    expect(atomicCall.sql).toContain("AND EXISTS (SELECT 1 FROM claimed)");
    expect(atomicCall.sql).toMatch(/WHERE id = \$\d+ AND status = 'confirmed'/);
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
