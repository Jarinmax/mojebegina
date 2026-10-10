// @vitest-environment node
//
// Mobilní tok 1.0 — AI vytěžení účtenky (needs_review). Stejná mock
// technika jako skladAtomicity.test.ts/skladUpload.test.ts (stub
// "server-only", nahradit @neondatabase/serverless transport špionem).
// extractReceiptData (lib/data/receiptExtractionModel.ts) je zmockovaná
// pryč — appka NIKDY nedělá skutečné (natož placené) volání modelu v
// testech; testuje se orchestrace (oprávnění, idempotence/souběh,
// dodavatel, mapování, DPH) na reálném kódu.
//
// Přesné SQL fragmenty v matcherech níž byly ověřené reálným diagnostickým
// během (console.log skutečného výstupu drizzle-orm/neon-http), ne
// odhadnuté — stejná metodika jako u předchozích souborů.
//
// Co tenhle test NEMŮŽE dokázat: skutečné chování Vercel AI Gateway/OIDC
// ani živou DB sémantiku unique indexů (suppliers, supplier_item_mappings)
// — to zůstává zdokumentované omezení (stejné jako u ostatních mock-
// transport testů v tomhle souboru skladu).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
import type { AuthContext } from "../types";

vi.mock("server-only", () => ({}));

type CapturedQuery = { sql: string; params: unknown[] };
const capturedQueries: CapturedQuery[] = [];

const RECEIPT_ID = "33333333-3333-3333-3333-333333333333";
const SUPPLIER_ID = "44444444-4444-4444-4444-444444444444";

// --- Řízení extrakčního claimu (idempotence/souběh, bod 12 zadání) -------
let claimSucceeds = true;
// --- Příjemka (fetchReceiptForExtraction i confirmGoodsReceiptLineMapping) ---
let receiptStatus: string | null = "draft";
let receiptDocumentNumber: string | null = null;
let receiptDocumentDate: string | null = null;
let receiptPaymentMethod: string | null = null;
// --- Nahrané strany ---------------------------------------------------------
let pageRows: Array<[string, string]> = [["sklad/r1/p1.jpg", "image/jpeg"]];
let blobContent: Uint8Array | null = new Uint8Array([1, 2, 3]);
// --- Dohledání dodavatele (bod 5 zadání) ------------------------------------
let supplierByIcoRow: [string, string] | null = null;
let supplierByNameRow: [string, string] | null = null;
// --- Mapování položek (body 6+7 zadání) -------------------------------------
let mappingByCodeRow: [string, string, string, string] | null = null; // id, stock_item_id, line_kind, canonical_unit
let mappingByDescriptionRow: [string, string, string, string] | null = null;
let insertedLineCounter = 0;
// --- confirmGoodsReceiptLineMapping ----------------------------------------
let stockItemExists = true;
let lineRowForConfirm: [string, string | null, string, number, string] | null = [
  "line-1",
  "123",
  "Pivo 12°",
  12,
  "ks",
];
let existingMappingForConfirmRow: [string] | null = null;

function makeBlobStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

vi.mock("@neondatabase/serverless", () => ({
  neon: () => (sqlText: string, params: unknown[]) => {
    capturedQueries.push({ sql: sqlText, params });

    // fetchReceiptForExtraction
    if (sqlText.includes('"document_number", "document_date", "payment_method"')) {
      if (!receiptStatus) return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
      return Promise.resolve({
        rows: [[RECEIPT_ID, receiptStatus, SUPPLIER_ID, receiptDocumentNumber, receiptDocumentDate, receiptPaymentMethod]],
        rowCount: 1,
        fields: [],
      });
    }
    // claim UPDATE (raw sql template, keeps original casing)
    if (sqlText.includes("UPDATE goods_receipts") && sqlText.includes("extraction_status = 'pending'")) {
      const rows = claimSucceeds ? [[RECEIPT_ID]] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    // pages
    if (sqlText.startsWith('select "goods_receipt_document_pages"')) {
      return Promise.resolve({ rows: pageRows, rowCount: pageRows.length, fields: [] });
    }
    // supplier by ico
    if (sqlText.startsWith('select "id", "name" from "suppliers" where "suppliers"."ico"')) {
      const rows = supplierByIcoRow ? [supplierByIcoRow] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    // supplier by normalized name (ico IS NULL)
    if (sqlText.startsWith('select "id", "name" from "suppliers" where ("suppliers"."name_normalized"')) {
      const rows = supplierByNameRow ? [supplierByNameRow] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    // supplier correction on the receipt (goods_receipts.supplier_id/snapshot)
    if (sqlText.startsWith('update "goods_receipts" set "supplier_id"')) {
      return Promise.resolve({ rows: [], rowCount: 1, fields: [] });
    }
    // item mapping lookup (join stock_items) — by code or by description
    if (sqlText.startsWith('select "supplier_item_mappings"."id"')) {
      const byCode = sqlText.includes('"supplier_item_mappings"."supplier_item_code" = $2');
      const row = byCode ? mappingByCodeRow : mappingByDescriptionRow;
      const rows = row ? [row] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    // bump last_used_at (auto-mapping found during extraction) — 1 field only
    if (sqlText.startsWith('update "supplier_item_mappings" set "last_used_at"')) {
      return Promise.resolve({ rows: [], rowCount: 1, fields: [] });
    }
    // insert extracted lines
    if (sqlText.startsWith('insert into "goods_receipt_lines"')) {
      insertedLineCounter += 1;
      return Promise.resolve({ rows: [[`line-${insertedLineCounter}`]], rowCount: 1, fields: [] });
    }
    // final goods_receipts update (extraction_status/extraction_raw/…)
    if (sqlText.startsWith('update "goods_receipts" set "document_number"')) {
      return Promise.resolve({ rows: [], rowCount: 1, fields: [] });
    }
    if (sqlText.startsWith('insert into "goods_receipt_activity"')) {
      return Promise.resolve({ rows: [["activity-1"]], rowCount: 1, fields: [] });
    }
    // extraction_status = 'failed' best-effort update (markExtractionFailed)
    if (sqlText.startsWith('update "goods_receipts" set "extraction_status"')) {
      return Promise.resolve({ rows: [], rowCount: 1, fields: [] });
    }

    // --- confirmGoodsReceiptLineMapping ---
    if (sqlText.startsWith('select "id", "status", "supplier_id" from')) {
      if (!receiptStatus) return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
      return Promise.resolve({ rows: [[RECEIPT_ID, receiptStatus, SUPPLIER_ID]], rowCount: 1, fields: [] });
    }
    if (sqlText.startsWith('select "id" from "stock_items"')) {
      const rows = stockItemExists ? [["item-1"]] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    if (sqlText.startsWith('select "id", "supplier_item_code", "raw_description"')) {
      const rows = lineRowForConfirm ? [lineRowForConfirm] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    if (sqlText.startsWith('update "goods_receipt_lines" set "stock_item_id"')) {
      return Promise.resolve({ rows: [], rowCount: 1, fields: [] });
    }
    if (sqlText.startsWith('select "id" from "supplier_item_mappings"')) {
      const rows = existingMappingForConfirmRow ? [existingMappingForConfirmRow] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    if (sqlText.startsWith('update "supplier_item_mappings" set "stock_item_id"')) {
      return Promise.resolve({ rows: [], rowCount: 1, fields: [] });
    }
    if (sqlText.startsWith('insert into "supplier_item_mappings"')) {
      return Promise.resolve({ rows: [["mapping-new"]], rowCount: 1, fields: [] });
    }

    return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
  },
}));

const mockGetAuthContext = vi.fn<() => Promise<AuthContext>>();
vi.mock("../authContext", () => ({ getAuthContext: () => mockGetAuthContext() }));

const mockGet = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("@vercel/blob", () => ({ get: (...args: unknown[]) => mockGet(...args) }));

const mockExtractReceiptData = vi.fn();
vi.mock("../receiptExtractionModel", () => ({
  extractReceiptData: (...args: unknown[]) => mockExtractReceiptData(...args),
  EXTRACTION_MODEL_ID: "openai/gpt-5-nano",
}));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const STRELEC = "fdc7b836-2325-4568-b9b7-5ac579cd8972";

function ctxFor(userId: string): AuthContext {
  return { userId, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Test", email: "t@example.com" };
}

function baseExtractedLine(overrides: Record<string, unknown> = {}) {
  return {
    description: "Pivo 12°",
    supplierItemCode: "123",
    supplierAuxiliaryCode: null,
    packageQuantity: 1,
    unitsPerPackage: 1,
    unit: "ks",
    unitPriceWithoutVat: 100,
    totalWithoutVat: 100,
    vatAmount: 999999, // záměrně nesmysl — appka ji nikdy nepoužije (bod 4)
    totalWithVat: 121,
    suggestedCategory: "resale_goods",
    suggestedStockItemName: "Pivo 12°",
    suggestedCanonicalUnit: "l",
    ...overrides,
  };
}

function baseExtracted(overrides: Record<string, unknown> = {}) {
  return {
    supplierName: "Test Supplier",
    supplierIco: null,
    supplierDic: null,
    documentNumber: "DOC-1",
    documentDate: "2026-01-01",
    paymentMethod: "hotově",
    lines: [baseExtractedLine()],
    totalWithoutVat: 100,
    totalVat: 21,
    totalWithVat: 121,
    ...overrides,
  };
}

beforeEach(() => {
  capturedQueries.length = 0;
  claimSucceeds = true;
  receiptStatus = "draft";
  receiptDocumentNumber = null;
  receiptDocumentDate = null;
  receiptPaymentMethod = null;
  pageRows = [["sklad/r1/p1.jpg", "image/jpeg"]];
  blobContent = new Uint8Array([1, 2, 3]);
  supplierByIcoRow = null;
  supplierByNameRow = null;
  mappingByCodeRow = null;
  mappingByDescriptionRow = null;
  insertedLineCounter = 0;
  stockItemExists = true;
  lineRowForConfirm = ["line-1", "123", "Pivo 12°", 12, "ks"];
  existingMappingForConfirmRow = null;

  mockGetAuthContext.mockReset();
  mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
  mockGet.mockReset();
  mockGet.mockImplementation(async () => {
    if (blobContent === null) return null;
    return { statusCode: 200, stream: makeBlobStream(blobContent) };
  });
  mockExtractReceiptData.mockReset();
  mockExtractReceiptData.mockResolvedValue(baseExtracted());
});

describe("triggerGoodsReceiptExtraction — oprávnění (bod 2 zadání: server čte strany PO kontrole oprávnění)", () => {
  it("nepřihlášený uživatel vyhodí UnauthenticatedError bez jakéhokoli SQL a bez volání modelu", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    await expect(triggerGoodsReceiptExtraction(RECEIPT_ID)).rejects.toThrow();
    expect(capturedQueries.length).toBe(0);
    expect(mockExtractReceiptData).not.toHaveBeenCalled();
  });

  it("Jiří Střelec (bez requireUploadAccess) vyhodí ForbiddenError bez jakéhokoli SQL", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(STRELEC));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    await expect(triggerGoodsReceiptExtraction(RECEIPT_ID)).rejects.toThrow();
    expect(capturedQueries.length).toBe(0);
  });
});

describe("triggerGoodsReceiptExtraction — idempotence a souběh (bod 12 zadání)", () => {
  it("příjemka není draft → {ok:false}, žádný claim", async () => {
    receiptStatus = "confirmed";
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(false);
    expect(capturedQueries.some((q) => q.sql.includes("extraction_status = 'pending'"))).toBe(false);
  });

  it("souběžný/opakovaný claim selže (0 řádků, např. už běží nebo už má řádky) → {ok:false}, model se NEVOLÁ", async () => {
    claimSucceeds = false;
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(false);
    expect(mockExtractReceiptData).not.toHaveBeenCalled();
    expect(capturedQueries.some((q) => q.sql.startsWith("select \"goods_receipt_document_pages\""))).toBe(false);
  });

  it("žádná nahraná strana → {ok:false}, extraction_status se nastaví na 'failed', model se nevolá", async () => {
    pageRows = [];
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(false);
    expect(mockExtractReceiptData).not.toHaveBeenCalled();
    expect(capturedQueries.some((q) => q.sql.startsWith('update "goods_receipts" set "extraction_status"'))).toBe(true);
  });

  it("retry po selhání modelu: 1. pokus selže (failed, ŽÁDNÝ řádek), 2. pokus uspěje (přesně jeden INSERT řádku)", async () => {
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");

    mockExtractReceiptData.mockRejectedValueOnce(new Error("model timeout"));
    const first = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(first.ok).toBe(false);
    expect(capturedQueries.some((q) => q.sql.startsWith('insert into "goods_receipt_lines"'))).toBe(false);

    capturedQueries.length = 0;
    const second = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(second.ok).toBe(true);
    const lineInserts = capturedQueries.filter((q) => q.sql.startsWith('insert into "goods_receipt_lines"'));
    expect(lineInserts).toHaveLength(1);
  });
});

describe("triggerGoodsReceiptExtraction — bezpečné logování technické chyby AI vytěžení (body 1+5 zadání)", () => {
  it("technická chyba modelu se bezpečně zaloguje (name/message/statusCode/zkrácený responseBody/cause), NIKDY token/prompt/osobní údaj — klient dostane jen obecnou českou hlášku", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const secretToken = "sk-live-SUPER-SECRET-TOKEN-should-never-be-logged";
    const personalDataFromReceipt = "Jan Novák, RČ 900101/1234";
    const longResponseBody = `{"error":"rate_limited"}${"x".repeat(2000)}`;
    const cause = new Error("ECONNRESET upstream");

    const apiError = new APICallError({
      message: "Bad Request",
      url: `https://ai-gateway.vercel.sh/v1/responses?token=${secretToken}`,
      requestBodyValues: { authorization: `Bearer ${secretToken}`, prompt: personalDataFromReceipt },
      statusCode: 400,
      responseBody: longResponseBody,
      cause,
    });

    mockExtractReceiptData.mockRejectedValueOnce(apiError);
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    // Klient dostane jen obecnou českou hlášku — žádné interní detaily chyby.
    expect(result).toEqual({ ok: false, error: "Vytěžení dokladu se nezdařilo. Zkuste to znovu." });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const [logMessage, logInfo] = consoleErrorSpy.mock.calls[0] as [string, Record<string, unknown>];

    // Zpráva v logu identifikuje příjemku/model, ale ne detail chyby.
    expect(logMessage).toContain(RECEIPT_ID);

    // Bezpečná pole se zalogovala.
    expect(logInfo.name).toBe("AI_APICallError");
    expect(logInfo.message).toBe("Bad Request");
    expect(logInfo.statusCode).toBe(400);
    expect(typeof logInfo.responseBody).toBe("string");
    expect((logInfo.responseBody as string).length).toBeLessThanOrEqual(501); // bezpečně zkrácené, ne celých ~2000 znaků
    expect(logInfo.cause).toEqual({ name: "Error", message: "ECONNRESET upstream" });

    // Zakázaný obsah (token, prompt, osobní údaj z účtenky) se NIKDY nezaloguje.
    expect(logInfo).not.toHaveProperty("url");
    expect(logInfo).not.toHaveProperty("requestBodyValues");
    expect(logInfo).not.toHaveProperty("responseHeaders");
    const loggedJson = JSON.stringify([logMessage, logInfo]);
    expect(loggedJson).not.toContain(secretToken);
    expect(loggedJson).not.toContain(personalDataFromReceipt);
    expect(loggedJson).not.toContain("Bearer");

    consoleErrorSpy.mockRestore();
  });
});

describe("triggerGoodsReceiptExtraction — vícestránkový doklad (bod 2 zadání)", () => {
  it("čte VŠECHNY nahrané strany a pošle je modelu jako jeden doklad", async () => {
    pageRows = [
      ["sklad/r1/p1.jpg", "image/jpeg"],
      ["sklad/r1/p2.jpg", "image/jpeg"],
      ["sklad/r1/p3.jpg", "image/jpeg"],
    ];
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    expect(mockExtractReceiptData).toHaveBeenCalledTimes(1);
    const images = mockExtractReceiptData.mock.calls[0][0] as unknown[];
    expect(images).toHaveLength(3);
  });
});

describe("triggerGoodsReceiptExtraction — dodavatel: IČO nejdřív, pak normalizovaný název, NIKDY auto-vytvoření duplicity (bod 5 zadání)", () => {
  it("shoda podle IČO má přednost před názvem a aktualizuje supplier_id na příjemce", async () => {
    supplierByIcoRow = ["supplier-matched", "Matched Supplier"];
    mockExtractReceiptData.mockResolvedValue(baseExtracted({ supplierIco: "74337297", supplierName: "Jiný text na dokladu" }));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    const supplierUpdate = capturedQueries.find((q) => q.sql.startsWith('update "goods_receipts" set "supplier_id"'));
    expect(supplierUpdate).toBeTruthy();
    expect(supplierUpdate!.params).toContain("supplier-matched");
  });

  it("bez IČO shody padá na normalizovaný název", async () => {
    supplierByIcoRow = null;
    supplierByNameRow = ["supplier-by-name", "Pivovar Náchod"];
    mockExtractReceiptData.mockResolvedValue(baseExtracted({ supplierIco: null, supplierName: "Pivovar Náchod" }));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    const supplierUpdate = capturedQueries.find((q) => q.sql.startsWith('update "goods_receipts" set "supplier_id"'));
    expect(supplierUpdate!.params).toContain("supplier-by-name");
  });

  it("žádná shoda (nový/neznámý dodavatel) → supplier_id na příjemce se NEMĚNÍ a NIKDY nevznikne nový řádek v suppliers", async () => {
    supplierByIcoRow = null;
    supplierByNameRow = null;
    mockExtractReceiptData.mockResolvedValue(baseExtracted({ supplierIco: "99999999", supplierName: "Úplně neznámý dodavatel" }));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    expect(capturedQueries.some((q) => q.sql.startsWith('update "goods_receipts" set "supplier_id"'))).toBe(false);
    expect(capturedQueries.some((q) => q.sql.startsWith('insert into "suppliers"'))).toBe(false);
  });
});

describe("triggerGoodsReceiptExtraction — DPH se vždy dopočítá, model se nevěří (bod 4 zadání)", () => {
  it("zapsaný řádek má vat_hal dopočítané appkou, NE modelovo vatAmount (999999)", async () => {
    mockExtractReceiptData.mockResolvedValue(
      baseExtracted({ lines: [baseExtractedLine({ totalWithoutVat: 100, totalWithVat: 121, vatAmount: 999999 })] })
    );
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    const lineInsert = capturedQueries.find((q) => q.sql.startsWith('insert into "goods_receipt_lines"'))!;
    expect(lineInsert.params).toContain(2100); // 12100 - 10000, nikdy 999999 * 100
    expect(lineInsert.params).not.toContain(99999900);
  });
});

describe("triggerGoodsReceiptExtraction — mapování položek (body 6+7 zadání)", () => {
  it("známé mapování (podle supplier_id + supplier_item_code) se předvyplní automaticky, last_used_at se bumpne", async () => {
    mappingByCodeRow = ["mapping-1", "item-known", "resale_goods", "l"];
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    const lineInsert = capturedQueries.find((q) => q.sql.startsWith('insert into "goods_receipt_lines"'))!;
    expect(lineInsert.params).toContain("item-known");
    expect(lineInsert.params).toContain("auto");
    expect(capturedQueries.some((q) => q.sql.startsWith('update "supplier_item_mappings" set "last_used_at"'))).toBe(true);
  });

  it("popis je jen FALLBACK — s vyplněným kódem se mapování podle popisu vůbec nehledá", async () => {
    mappingByCodeRow = null;
    mappingByDescriptionRow = ["mapping-2", "item-by-desc", "resale_goods", "l"];
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID); // line má supplierItemCode="123"
    expect(result.ok).toBe(true);
    const lineInsert = capturedQueries.find((q) => q.sql.startsWith('insert into "goods_receipt_lines"'))!;
    // kód "123" nemá známé mapování (mappingByCodeRow=null) a POPIS se jako
    // fallback nepoužije, protože kód byl vyplněný — položka zůstane
    // nenamapovaná (mapping_source NULL), i když "mappingByDescriptionRow"
    // existuje.
    expect(lineInsert.params).not.toContain("item-by-desc");
  });

  it("neznámá položka (žádné mapování) → nenamapováno (stock_item_id NULL, mapping_source NULL), kategorie = AI návrh", async () => {
    mockExtractReceiptData.mockResolvedValue(
      baseExtracted({ lines: [baseExtractedLine({ supplierItemCode: null, suggestedCategory: "operating_supply" })] })
    );
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    const lineInsert = capturedQueries.find((q) => q.sql.startsWith('insert into "goods_receipt_lines"'))!;
    expect(lineInsert.params).toContain(null); // stock_item_id mezi parametry je null
    expect(lineInsert.params).toContain("operating_supply");
    expect(lineInsert.params).not.toContain("auto");
    // Návrh (kategorie/karta/jednotka) se uloží do extraction_raw pro
    // kontrolní obrazovku, ne přímo jako potvrzené mapování (bod 7 zadání).
    const receiptUpdate = capturedQueries.find((q) => q.sql.startsWith('update "goods_receipts" set "document_number"'))!;
    const extractionRawJson = JSON.stringify(receiptUpdate.params);
    expect(extractionRawJson).toContain("operating_supply");
    expect(extractionRawJson).toContain("Pivo 12°");
  });
});

describe("triggerGoodsReceiptExtraction — soukromá položka nikdy nedostane skladovou kartu (bod 8 zadání)", () => {
  it("suggestedCategory='non_stock_private' bez známého mapování → stock_item_id NULL, line_kind='non_stock_private'", async () => {
    mockExtractReceiptData.mockResolvedValue(
      baseExtracted({
        lines: [baseExtractedLine({ description: "Osobní nákup", supplierItemCode: null, suggestedCategory: "non_stock_private" })],
      })
    );
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    const lineInsert = capturedQueries.find((q) => q.sql.startsWith('insert into "goods_receipt_lines"'))!;
    expect(lineInsert.params).toContain("non_stock_private");
    expect(lineInsert.params).toContain(null);
  });
});

describe("confirmGoodsReceiptLineMapping — oprávnění, validace a zapamatování mapování (bod 7+10 zadání)", () => {
  it("nepřihlášený uživatel vyhodí UnauthenticatedError", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    await expect(
      confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", { stockItemId: "item-1", lineKind: "resale_goods", rememberMapping: false })
    ).rejects.toThrow();
  });

  it("Jiří Střelec (bez requireReviewAccess) vyhodí ForbiddenError", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(STRELEC));
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    await expect(
      confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", { stockItemId: "item-1", lineKind: "resale_goods", rememberMapping: false })
    ).rejects.toThrow();
  });

  it("soukromá položka se stockItemId → {ok:false}", async () => {
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    const result = await confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", {
      stockItemId: "item-1",
      lineKind: "non_stock_private",
      rememberMapping: false,
    });
    expect(result.ok).toBe(false);
  });

  it("skladová/zbožová kategorie bez stockItemId → {ok:false}", async () => {
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    const result = await confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", {
      stockItemId: null,
      lineKind: "resale_goods",
      rememberMapping: false,
    });
    expect(result.ok).toBe(false);
  });

  it("neexistující skladová karta → {ok:false}", async () => {
    stockItemExists = false;
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    const result = await confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", {
      stockItemId: "item-missing",
      lineKind: "resale_goods",
      rememberMapping: false,
    });
    expect(result.ok).toBe(false);
  });

  it("potvrzení nastaví mapping_source='manual' (i pro AI návrh, jakmile ho člověk potvrdí)", async () => {
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    const result = await confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", {
      stockItemId: "item-1",
      lineKind: "resale_goods",
      rememberMapping: false,
    });
    expect(result.ok).toBe(true);
    const lineUpdate = capturedQueries.find((q) => q.sql.startsWith('update "goods_receipt_lines" set "stock_item_id"'))!;
    expect(lineUpdate.params).toContain("manual");
    expect(capturedQueries.some((q) => q.sql.startsWith('insert into "supplier_item_mappings"'))).toBe(false);
  });

  it("rememberMapping=true a mapování ještě neexistuje → založí nové supplier_item_mappings", async () => {
    existingMappingForConfirmRow = null;
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    const result = await confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", {
      stockItemId: "item-1",
      lineKind: "resale_goods",
      rememberMapping: true,
    });
    expect(result.ok).toBe(true);
    expect(capturedQueries.some((q) => q.sql.startsWith('insert into "supplier_item_mappings"'))).toBe(true);
  });

  it("rememberMapping=true a mapování už existuje → aktualizuje ho (ne duplicitní insert)", async () => {
    existingMappingForConfirmRow = ["mapping-existing"];
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    const result = await confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", {
      stockItemId: "item-1",
      lineKind: "resale_goods",
      rememberMapping: true,
    });
    expect(result.ok).toBe(true);
    expect(capturedQueries.some((q) => q.sql.startsWith('insert into "supplier_item_mappings"'))).toBe(false);
    expect(capturedQueries.some((q) => q.sql.startsWith('update "supplier_item_mappings" set "stock_item_id"'))).toBe(true);
  });

  it("rememberMapping=false nikdy nezapisuje do supplier_item_mappings", async () => {
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    const result = await confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", {
      stockItemId: "item-1",
      lineKind: "resale_goods",
      rememberMapping: false,
    });
    expect(result.ok).toBe(true);
    expect(capturedQueries.some((q) => q.sql.startsWith('insert into "supplier_item_mappings"'))).toBe(false);
    expect(capturedQueries.some((q) => q.sql.startsWith('update "supplier_item_mappings" set "stock_item_id"'))).toBe(false);
  });
});
