// @vitest-environment node
//
// Mobilní tok 1.0 — AI vytěžení účtenky (needs_review), DVOUFÁZOVĚ od
// třetího kola oprav (po druhém ostrém testu na Preview `61c9755`, kde
// nano i mini nad OBRÁZKY nevrátily ani jeden použitelný řádek): FÁZE 1
// čisté OCR (receiptOcrModel.ts, obrázky → prostý text), FÁZE 2
// strukturování toho textu (receiptExtractionModel.ts, text → schéma).
// Stejná mock technika jako skladAtomicity.test.ts/skladUpload.test.ts
// (stub "server-only", nahradit @neondatabase/serverless transport
// špionem). Obě fáze jsou zmockované pryč — appka NIKDY nedělá skutečné
// (natož placené) volání modelu v testech; testuje se orchestrace
// (oprávnění, idempotence/souběh, dodavatel, mapování, DPH, nejvýš dvě
// modelová volání na pokus) na reálném kódu.
//
// Přesné SQL fragmenty v matcherech níž byly ověřené reálným diagnostickým
// během (console.log skutečného výstupu drizzle-orm/neon-http), ne
// odhadnuté — stejná metodika jako u předchozích souborů.
//
// Co tenhle test NEMŮŽE dokázat: skutečné chování Vercel AI Gateway/OIDC,
// skutečnou přesnost OCR na reálné fotce, ani živou DB sémantiku unique
// indexů (suppliers, supplier_item_mappings) — to zůstává zdokumentované
// omezení (stejné jako u ostatních mock-transport testů v tomhle souboru
// skladu).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
import { ModelOutputTruncatedError } from "../aiCallDiagnostics";
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
let finalWriteSucceeds = true;
// --- confirmGoodsReceiptLineMapping ----------------------------------------
let stockItemExists = true;
let stockItemKind = "resale_goods";
let lineRowForConfirm: [string, string | null, string, number, string, string] | null = [
  "line-1",
  "123",
  "Pivo 12°",
  12,
  "ks",
  "ks",
];
let existingMappingForConfirmRow: [string] | null = null;

// Atomický zápis vytěženého návrhu = jediný příkaz; řádky jsou v něm jako
// JSON (jsonb_to_recordset), hlavička a historie jako další parametry.
function extractionWrites(): CapturedQuery[] {
  return capturedQueries.filter((q) => q.sql.includes("jsonb_to_recordset") && q.sql.includes("INSERT INTO goods_receipt_lines"));
}
function extractionWrite(): CapturedQuery {
  const writes = extractionWrites();
  expect(writes).toHaveLength(1);
  return writes[0];
}
function writtenLines(): Array<Record<string, unknown>> {
  const json = extractionWrite().params.find((p) => typeof p === "string" && p.startsWith("[")) as string;
  return JSON.parse(json);
}

function makeBlobStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    const client = (sqlText: string, params: unknown[]) => {
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
    if (sqlText.includes("UPDATE goods_receipts") && sqlText.includes("extraction_status = 'pending'") && !sqlText.includes("jsonb_to_recordset")) {
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
    // atomický zápis vytěženého návrhu (hlavička + všechny řádky + historie jedním příkazem)
    if (sqlText.includes("jsonb_to_recordset") && sqlText.includes("INSERT INTO goods_receipt_lines")) {
      const rows = finalWriteSucceeds ? [["activity-1"]] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
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
    if (sqlText.startsWith('select "kind", "canonical_unit" from "stock_items"')) {
      const rows = stockItemExists ? [[stockItemKind, "ks"]] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    if (sqlText.startsWith('select "id", "supplier_item_code", "raw_description"')) {
      const rows = lineRowForConfirm ? [lineRowForConfirm] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    if (sqlText.startsWith('update "goods_receipt_lines" set')) {
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

const mockGet = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("@vercel/blob", () => ({ get: (...args: unknown[]) => mockGet(...args) }));

// FÁZE 2: strukturování OCR textu do schématu.
const mockExtractStructuredReceipt = vi.fn();
vi.mock("../receiptExtractionModel", () => ({
  extractStructuredReceipt: (...args: unknown[]) => mockExtractStructuredReceipt(...args),
  EXTRACTION_MODEL_ID: "openai/gpt-5-nano",
}));

// FÁZE 1: čisté OCR (obrázky → prostý text).
const mockPerformReceiptOcr = vi.fn<(images: unknown[], receiptId: string) => Promise<string>>();
vi.mock("../receiptOcrModel", () => ({
  performReceiptOcr: (images: unknown[], receiptId: string) => mockPerformReceiptOcr(images, receiptId),
  OCR_MODEL_ID: "alibaba/qwen3-vl-instruct",
  MIN_OCR_TEXT_LENGTH: 30,
}));

// Příprava obrázku (ořez/normalizace/dělení na výřezy) je čistá obrazová
// logika beze vztahu k DB/oprávnění/modelu — testuje se zvlášť se
// skutečnými syntetickými obrázky v receiptImagePreprocessing.test.ts.
// Tady se mockuje identitou (1 strana → 1 nezměněný "výřez" + neutrální
// diagnostika), aby testy orchestrace zůstaly nezávislé na obrazové
// knihovně a existující očekávání (1 strana = 1 obrázek poslaný OCR)
// platila beze změny.
type MockImage = { mimeType: string; bytes: Buffer };
type MockDiagnostics = { originalWidth: number | null; originalHeight: number | null; crop: unknown; bandDimensions: unknown[] };
const mockPreprocessReceiptPage = vi.fn<(image: MockImage) => Promise<{ images: MockImage[]; diagnostics: MockDiagnostics }>>();
vi.mock("../receiptImagePreprocessing", () => ({
  preprocessReceiptPage: (...args: [MockImage]) => mockPreprocessReceiptPage(...args),
}));

function neutralDiagnostics(): MockDiagnostics {
  return { originalWidth: 800, originalHeight: 1200, crop: null, bandDimensions: [{ width: 800, height: 1200 }] };
}

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

const DEFAULT_OCR_TEXT = "=== VÝŘEZ 1 ===\nPENNY MARKET s.r.o.\nPivo 12° 1 ks 100,00 Kč\nCelkem 121,00 Kč";

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
  finalWriteSucceeds = true;
  stockItemExists = true;
  stockItemKind = "resale_goods";
  lineRowForConfirm = ["line-1", "123", "Pivo 12°", 12, "ks", "ks"];
  existingMappingForConfirmRow = null;

  mockGetAuthContext.mockReset();
  mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
  mockGet.mockReset();
  mockGet.mockImplementation(async () => {
    if (blobContent === null) return null;
    return { statusCode: 200, stream: makeBlobStream(blobContent) };
  });
  mockExtractStructuredReceipt.mockReset();
  mockExtractStructuredReceipt.mockResolvedValue(baseExtracted());
  mockPerformReceiptOcr.mockReset();
  mockPerformReceiptOcr.mockResolvedValue(DEFAULT_OCR_TEXT);
  mockPreprocessReceiptPage.mockReset();
  mockPreprocessReceiptPage.mockImplementation(async (image) => ({ images: [image], diagnostics: neutralDiagnostics() }));
});

describe("triggerGoodsReceiptExtraction — oprávnění (bod 2 zadání: server čte strany PO kontrole oprávnění)", () => {
  it("nepřihlášený uživatel vyhodí UnauthenticatedError bez jakéhokoli SQL a bez volání modelu", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    await expect(triggerGoodsReceiptExtraction(RECEIPT_ID)).rejects.toThrow();
    expect(capturedQueries.length).toBe(0);
    expect(mockPerformReceiptOcr).not.toHaveBeenCalled();
    expect(mockExtractStructuredReceipt).not.toHaveBeenCalled();
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

  it("souběžný/opakovaný claim selže (0 řádků, např. už běží nebo už má řádky) → {ok:false}, OCR se NEVOLÁ", async () => {
    claimSucceeds = false;
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(false);
    expect(mockPerformReceiptOcr).not.toHaveBeenCalled();
    expect(capturedQueries.some((q) => q.sql.startsWith("select \"goods_receipt_document_pages\""))).toBe(false);
  });

  it("žádná nahraná strana → {ok:false}, extraction_status se nastaví na 'failed', OCR se nevolá", async () => {
    pageRows = [];
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(false);
    expect(mockPerformReceiptOcr).not.toHaveBeenCalled();
    expect(capturedQueries.some((q) => q.sql.startsWith('update "goods_receipts" set "extraction_status"'))).toBe(true);
  });

  it("retry po selhání OCR: 1. pokus selže (failed, ŽÁDNÝ řádek), 2. pokus uspěje (přesně jeden INSERT řádku)", async () => {
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");

    mockPerformReceiptOcr.mockRejectedValueOnce(new Error("OCR timeout"));
    const first = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(first.ok).toBe(false);
    expect(extractionWrites()).toHaveLength(0);

    capturedQueries.length = 0;
    const second = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(second.ok).toBe(true);
    expect(extractionWrites()).toHaveLength(1);
    expect(writtenLines()).toHaveLength(1);
  });
});

describe("triggerGoodsReceiptExtraction — bezpečné logování technické chyby (body 1+5 zadání)", () => {
  it("technická chyba OCR (fáze 1) se bezpečně zaloguje (name/message/statusCode/zkrácený responseBody/cause), NIKDY token/prompt/osobní údaj — klient dostane jen obecnou českou hlášku", async () => {
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

    mockPerformReceiptOcr.mockRejectedValueOnce(apiError);
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    // Klient dostane jen obecnou českou hlášku — žádné interní detaily chyby.
    // kind:"technical" — jasná technická chyba, appka ji NEPREZENTUJE jako
    // problém s fotkou (bod 4 zadání).
    expect(result).toEqual({ ok: false, error: "Vytěžení dokladu se nezdařilo. Zkuste to znovu.", kind: "technical" });
    expect(mockExtractStructuredReceipt).not.toHaveBeenCalled(); // fáze 2 se vůbec nespustí

    const errorCalls = consoleErrorSpy.mock.calls;
    expect(errorCalls).toHaveLength(1);
    const [logMessage, logInfo] = errorCalls[0] as [string, Record<string, unknown>];

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
    const loggedJson = JSON.stringify(errorCalls.map((call) => call));
    expect(loggedJson).not.toContain(secretToken);
    expect(loggedJson).not.toContain(personalDataFromReceipt);
    expect(loggedJson).not.toContain("Bearer");

    consoleErrorSpy.mockRestore();
  });

  it("technická chyba strukturování (fáze 2) se bezpečně zaloguje stejně jako chyba OCR", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const apiError = new APICallError({
      message: "Service Unavailable",
      url: "https://ai-gateway.vercel.sh/v1/responses",
      requestBodyValues: { authorization: "Bearer secret-struct-token" },
      statusCode: 503,
      responseBody: "upstream down",
      cause: new Error("ETIMEDOUT"),
    });

    mockExtractStructuredReceipt.mockRejectedValueOnce(apiError);
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    expect(result).toEqual({ ok: false, error: "Vytěžení dokladu se nezdařilo. Zkuste to znovu.", kind: "technical" });
    expect(mockPerformReceiptOcr).toHaveBeenCalledTimes(1); // fáze 1 proběhla v pořádku

    const errorCalls = consoleErrorSpy.mock.calls;
    const [logMessage, logInfo] = errorCalls[errorCalls.length - 1] as [string, Record<string, unknown>];
    expect(logMessage).toContain(RECEIPT_ID);
    expect(logInfo.name).toBe("AI_APICallError");
    expect(logInfo.statusCode).toBe(503);
    expect(logInfo).not.toHaveProperty("requestBodyValues");
    expect(JSON.stringify(errorCalls)).not.toContain("secret-struct-token");

    consoleErrorSpy.mockRestore();
  });
});

describe("triggerGoodsReceiptExtraction — výstupní limit modelu (ModelOutputTruncatedError, hypotéza pro reálný nález 16→8 položek na MAKRO faktuře) — appka NEPŘIJME částečný výsledek, BEZ dalšího (placeného) pokusu", () => {
  it("OCR fáze useknutá limitem výstupu → {ok:false, kind:'technical'}, jasná hláška o nedokončeném čtení, strukturování se VŮBEC nezavolá, žádný druhý pokus", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPerformReceiptOcr.mockRejectedValueOnce(new ModelOutputTruncatedError("ocr"));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    expect(result).toEqual({
      ok: false,
      error: "Čtení dokladu se nepodařilo dokončit — model dosáhl limitu délky výstupu. Zkuste to znovu.",
      kind: "technical",
    });
    expect(mockExtractStructuredReceipt).not.toHaveBeenCalled(); // fáze 2 se vůbec nespustí
    expect(mockPerformReceiptOcr).toHaveBeenCalledTimes(1); // žádný automatický druhý (placený) pokus
    expect(capturedQueries.some((q) => q.sql.startsWith('update "goods_receipts" set "extraction_status"'))).toBe(true); // extraction_status → 'failed', retry zůstává možný ručně

    consoleErrorSpy.mockRestore();
  });

  it("strukturovací fáze useknutá limitem výstupu → {ok:false, kind:'technical'}, stejná jasná hláška, OCR fáze už proběhla (nezopakuje se), žádný druhý pokus strukturování", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockExtractStructuredReceipt.mockRejectedValueOnce(new ModelOutputTruncatedError("structuring"));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    expect(result).toEqual({
      ok: false,
      error: "Čtení dokladu se nepodařilo dokončit — model dosáhl limitu délky výstupu. Zkuste to znovu.",
      kind: "technical",
    });
    expect(mockPerformReceiptOcr).toHaveBeenCalledTimes(1); // fáze 1 proběhla v pořádku, nezopakovala se
    expect(mockExtractStructuredReceipt).toHaveBeenCalledTimes(1); // žádný automatický druhý (placený) pokus

    consoleErrorSpy.mockRestore();
  });

  it("normální dokončení (žádná z fází nevyhodí ModelOutputTruncatedError) → vytěžení pokračuje a uspěje jako dřív — hlášku o useknutém limitu appka nezobrazí bezdůvodně", async () => {
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result).toEqual({ ok: true });
  });
});

describe("triggerGoodsReceiptExtraction — OCR vrátí příliš málo textu → selhání BEZ dalšího placeného volání strukturovacího modelu", () => {
  it("OCR text pod MIN_OCR_TEXT_LENGTH → {ok:false}, extractStructuredReceipt se VŮBEC nezavolá", async () => {
    mockPerformReceiptOcr.mockResolvedValueOnce("(nečitelné)"); // 11 znaků, pod mockovaným prahem 30
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    expect(result.ok).toBe(false);
    // kind:"unreadable" — appka nezjistila dost textu, ale NETVRDÍ, že fotka
    // je prokázaně špatná (bod 4 zadání) — jen nabízí výměnu.
    expect(result).toMatchObject({ kind: "unreadable" });
    expect(mockExtractStructuredReceipt).not.toHaveBeenCalled();
    expect(extractionWrites()).toHaveLength(0);
    expect(capturedQueries.some((q) => q.sql.startsWith('update "goods_receipts" set "extraction_status"'))).toBe(true);
  });

  it("prázdný/jen bílé znaky OCR výstup se počítá jako nedostatečný text", async () => {
    mockPerformReceiptOcr.mockResolvedValueOnce("   \n\n  ");
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(false);
    expect(mockExtractStructuredReceipt).not.toHaveBeenCalled();
  });
});

describe("triggerGoodsReceiptExtraction — nejvýš dvě modelová volání na jeden pokus (OCR + strukturování, nikdy víc)", () => {
  it("úspěšný průběh: přesně jedno volání OCR a přesně jedno volání strukturování", async () => {
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result).toEqual({ ok: true });
    expect(mockPerformReceiptOcr).toHaveBeenCalledTimes(1);
    expect(mockExtractStructuredReceipt).toHaveBeenCalledTimes(1);
  });

  it("OCR selže (výjimka) → jen JEDNO volání celkem, strukturování se nezkouší", async () => {
    mockPerformReceiptOcr.mockRejectedValueOnce(new Error("OCR down"));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(mockPerformReceiptOcr).toHaveBeenCalledTimes(1);
    expect(mockExtractStructuredReceipt).toHaveBeenCalledTimes(0);
  });

  it("OCR vrátí málo textu → jen JEDNO volání celkem, strukturování se nezkouší (bez dalšího placeného pokusu)", async () => {
    mockPerformReceiptOcr.mockResolvedValueOnce("x");
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(mockPerformReceiptOcr).toHaveBeenCalledTimes(1);
    expect(mockExtractStructuredReceipt).toHaveBeenCalledTimes(0);
  });

  it("strukturování selže (výjimka) → přesně DVĚ volání celkem, žádný třetí pokus", async () => {
    mockExtractStructuredReceipt.mockRejectedValueOnce(new Error("structuring down"));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(mockPerformReceiptOcr).toHaveBeenCalledTimes(1);
    expect(mockExtractStructuredReceipt).toHaveBeenCalledTimes(1);
  });

  it("strukturování vrátí jen nepoužitelné řádky (bez popisu) → přesně DVĚ volání celkem, žádný další (placený) pokus", async () => {
    mockExtractStructuredReceipt.mockResolvedValueOnce(baseExtracted({ lines: [baseExtractedLine({ description: null })] }));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(false);
    expect(mockPerformReceiptOcr).toHaveBeenCalledTimes(1);
    expect(mockExtractStructuredReceipt).toHaveBeenCalledTimes(1);
  });
});

describe("triggerGoodsReceiptExtraction — OCR text jde do strukturování BEZE ZMĚNY (spojení/předání textu mezi fázemi)", () => {
  it("text vrácený OCR (včetně značek '=== VÝŘEZ N ===' z víc výřezů) se strukturovacímu modelu předá přesně a v plném rozsahu", async () => {
    const multiSectionOcrText = "=== VÝŘEZ 1 ===\nPENNY MARKET\nPivo 12° 1 ks 100,00 Kč\n=== VÝŘEZ 2 ===\nCelkem 121,00 Kč";
    mockPerformReceiptOcr.mockResolvedValueOnce(multiSectionOcrText);
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    expect(result.ok).toBe(true);
    expect(mockExtractStructuredReceipt).toHaveBeenCalledTimes(1);
    expect(mockExtractStructuredReceipt.mock.calls[0][0]).toBe(multiSectionOcrText); // beze změny, beze zkrácení
  });
});

describe("triggerGoodsReceiptExtraction — maloobchodní účtenka: chybějící množství/jednotka/rozpis DPH se dopočítá, jen skutečně nečitelný/nesmyslný řádek se vyřadí (oprava po druhém ostrém testu)", () => {
  it("dřívější problém end-to-end: packageQuantity:0 (Penny účtenka bez vytištěného množství, s cenou s DPH) se zapíše s množstvím 1, ne vyřadí", async () => {
    mockExtractStructuredReceipt.mockResolvedValue(
      baseExtracted({
        lines: [
          baseExtractedLine({
            description: "Rohlík",
            packageQuantity: 0,
            unitsPerPackage: null,
            unit: null,
            totalWithVat: 3.5,
            totalWithoutVat: null,
            unitPriceWithoutVat: null,
          }),
        ],
      })
    );
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    expect(result).toEqual({ ok: true });
    expect(writtenLines()[0].raw_package_quantity).toBe(1); // rawPackageQuantity defaultovalo na 1, řádek NENÍ vyřazený
  });

  it("skutečně nečitelný řádek (bez popisu) se tiše vyřadí, dobrý řádek se zapíše — doklad jako celek uspěje", async () => {
    mockExtractStructuredReceipt.mockResolvedValue(
      baseExtracted({
        lines: [baseExtractedLine({ description: "Pivo 12°" }), baseExtractedLine({ description: null })],
      })
    );
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    expect(result).toEqual({ ok: true });
    expect(writtenLines()).toHaveLength(1); // jen ten použitelný řádek, ne ten bez popisu
    expect(extractionWrite().sql).toContain("extraction_status = 'needs_review'"); // finální zápis, ne markExtractionFailed
    expect(capturedQueries.some((q) => q.sql.startsWith('update "goods_receipts" set "extraction_status"'))).toBe(false);

    const activityBody = JSON.stringify(extractionWrite().params);
    expect(activityBody).toContain("1 nečitelných řádků přeskočeno"); // reviewer vidí, že se něco tiše vynechalo
  });

  it("dřív nesprávně zahazované řádky (nulové/chybějící množství, chybějící jednotka, jedna záporná cena s jinou platnou) se teď PŘIJMOU — jen skutečně bez popisu NEBO bez jakékoli kladné ceny se zahodí", async () => {
    mockExtractStructuredReceipt.mockResolvedValue(
      baseExtracted({
        lines: [
          baseExtractedLine({ description: "Dobrý řádek" }),
          baseExtractedLine({ description: null }), // skutečně nesmyslný — bez popisu
          baseExtractedLine({ description: "Bez množství", packageQuantity: null }), // teď OK — defaultuje na 1
          baseExtractedLine({ description: "Záporná cena bez DPH, ale platná s DPH", totalWithoutVat: -5, totalWithVat: 121 }), // teď OK
          baseExtractedLine({ description: "Nulové balení", unitsPerPackage: 0 }), // teď OK — defaultuje na 1
          baseExtractedLine({ description: "Bez ceny vůbec", totalWithVat: null, totalWithoutVat: null, unitPriceWithoutVat: null }), // skutečně nesmyslný — bez ceny
        ],
      })
    );
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    expect(result).toEqual({ ok: true });
    expect(writtenLines()).toHaveLength(4); // "Dobrý řádek" + 3 dřív chybně zahazované; 2 skutečně nesmyslné zůstávají vyřazené
    expect(JSON.stringify(extractionWrite().params)).toContain("2 nečitelných řádků přeskočeno");
  });

  it("úplně nečitelný doklad (VŠECHNY řádky bez popisu) je selhání, ne prázdná needs_review příjemka — retry zůstává možný, žádný třetí pokus", async () => {
    mockExtractStructuredReceipt.mockResolvedValue(baseExtracted({ lines: [baseExtractedLine({ description: null })] }));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    expect(result.ok).toBe(false);
    // kind:"unreadable" — appka nezjistila žádnou použitelnou položku, ale
    // NETVRDÍ, že fotka je prokázaně špatná (bod 4 zadání) — jen nabízí
    // výměnu, příčina (fotka/obsah dokladu/omezení modelu) zůstává nejasná.
    expect(result).toMatchObject({ kind: "unreadable" });
    expect(extractionWrites()).toHaveLength(0);
    // Stejný bezpečný retry jako u chyby modelu: extraction_status → 'failed'.
    expect(capturedQueries.some((q) => q.sql.startsWith('update "goods_receipts" set "extraction_status"'))).toBe(true);
    expect(mockExtractStructuredReceipt).toHaveBeenCalledTimes(1); // žádný další (dražší) pokus
  });
});

describe("triggerGoodsReceiptExtraction — příprava obrázku (ořez/dělení dlouhé účtenky) se volá na každou stranu, pořadí výřezů jde celé do OCR", () => {
  it("jedna strana rozdělená na víc výřezů (dlouhá účtenka) pošle OCR VŠECHNY výřezy, v PŘESNĚ STEJNÉM pořadí z preprocessReceiptPage", async () => {
    const bandA = { mimeType: "image/jpeg", bytes: Buffer.from("band-a") };
    const bandB = { mimeType: "image/jpeg", bytes: Buffer.from("band-b") };
    const bandC = { mimeType: "image/jpeg", bytes: Buffer.from("band-c") };
    mockPreprocessReceiptPage.mockResolvedValueOnce({ images: [bandA, bandB, bandC], diagnostics: neutralDiagnostics() });

    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);

    expect(result.ok).toBe(true);
    expect(mockPerformReceiptOcr).toHaveBeenCalledTimes(1);
    const images = mockPerformReceiptOcr.mock.calls[0][0] as Array<{ bytes: Buffer }>;
    expect(images).toHaveLength(3);
    // Pořadí shora dolů (A, B, C) se zachovalo přesně — žádné přeskupení.
    expect(images[0].bytes.equals(bandA.bytes)).toBe(true);
    expect(images[1].bytes.equals(bandB.bytes)).toBe(true);
    expect(images[2].bytes.equals(bandC.bytes)).toBe(true);
  });
});

describe("triggerGoodsReceiptExtraction — vícestránkový doklad (bod 2 zadání)", () => {
  it("čte VŠECHNY nahrané strany a pošle je OCR jako jeden doklad, v pořadí stran", async () => {
    pageRows = [
      ["sklad/r1/p1.jpg", "image/jpeg"],
      ["sklad/r1/p2.jpg", "image/jpeg"],
      ["sklad/r1/p3.jpg", "image/jpeg"],
    ];
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    expect(mockPerformReceiptOcr).toHaveBeenCalledTimes(1);
    const images = mockPerformReceiptOcr.mock.calls[0][0] as unknown[];
    expect(images).toHaveLength(3);
  });
});

describe("triggerGoodsReceiptExtraction — dodavatel: IČO nejdřív, pak normalizovaný název, NIKDY auto-vytvoření duplicity (bod 5 zadání)", () => {
  it("shoda podle IČO má přednost před názvem a aktualizuje supplier_id na příjemce", async () => {
    supplierByIcoRow = ["supplier-matched", "Matched Supplier"];
    mockExtractStructuredReceipt.mockResolvedValue(baseExtracted({ supplierIco: "74337297", supplierName: "Jiný text na dokladu" }));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    // Oprava dodavatele je součástí atomického zápisu návrhu (supplier_id + snapshot jména).
    expect(extractionWrite().params).toContain("supplier-matched");
    expect(extractionWrite().params).toContain("Matched Supplier");
  });

  it("bez IČO shody padá na normalizovaný název", async () => {
    supplierByIcoRow = null;
    supplierByNameRow = ["supplier-by-name", "Pivovar Náchod"];
    mockExtractStructuredReceipt.mockResolvedValue(baseExtracted({ supplierIco: null, supplierName: "Pivovar Náchod" }));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    expect(extractionWrite().params).toContain("supplier-by-name");
  });

  it("žádná shoda (nový/neznámý dodavatel) → supplier_id na příjemce se NEMĚNÍ a NIKDY nevznikne nový řádek v suppliers", async () => {
    supplierByIcoRow = null;
    supplierByNameRow = null;
    mockExtractStructuredReceipt.mockResolvedValue(baseExtracted({ supplierIco: "99999999", supplierName: "Úplně neznámý dodavatel" }));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    expect(extractionWrite().params).toContain(SUPPLIER_ID); // supplier_id zůstává původní
    expect(capturedQueries.some((q) => q.sql.startsWith('insert into "suppliers"'))).toBe(false);
  });
});

describe("triggerGoodsReceiptExtraction — atomický zápis návrhu (blokující bod 5)", () => {
  it("hlavička, všechny řádky a historie jdou jedním příkazem za zámkem příjemky, jen pro claim TOHOTO pokusu", async () => {
    mockExtractStructuredReceipt.mockResolvedValue(
      baseExtracted({ lines: [baseExtractedLine({ description: "A" }), baseExtractedLine({ description: "B" }), baseExtractedLine({ description: "C" })] })
    );
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    expect(await triggerGoodsReceiptExtraction(RECEIPT_ID)).toEqual({ ok: true });

    const write = extractionWrite();
    expect(writtenLines().map((l) => l.raw_description)).toEqual(["A", "B", "C"]);
    expect(write.sql).toMatch(/WITH claimed AS \(\s*UPDATE goods_receipts/);
    expect(write.sql).toContain("AND extraction_status = 'pending'");
    expect(write.sql).toContain("AND updated_at = ");
    expect(write.sql).toContain("INSERT INTO goods_receipt_activity");
    // zámek je první příkaz téže dávky (transakce) těsně před zápisem
    const lockIdx = capturedQueries.findIndex((q) => q.sql.includes("pg_advisory_xact_lock"));
    expect(lockIdx).toBe(capturedQueries.indexOf(write) - 1);
    // žádné samostatné INSERTy řádků ani UPDATE hlavičky mimo ten příkaz
    expect(capturedQueries.some((q) => q.sql.startsWith('insert into "goods_receipt_lines"'))).toBe(false);
    expect(capturedQueries.some((q) => q.sql.startsWith('update "goods_receipts" set "document_number"'))).toBe(false);
  });

  it("claim mezitím převzal jiný pokus → nic se nezapíše, cizí stav se nepřepíše na 'failed'", async () => {
    finalWriteSucceeds = false;
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result).toMatchObject({ ok: false, kind: "technical" });
    expect(capturedQueries.some((q) => q.sql.startsWith('update "goods_receipts" set "extraction_status"'))).toBe(false);
  });

  it("celková částka dokladu se uloží k pozdějšímu porovnání (0 = neznámá → NULL, nikdy 0 Kč)", async () => {
    mockExtractStructuredReceipt.mockResolvedValue(baseExtracted({ totalWithVat: 1234.5 }));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(extractionWrite().sql).toContain("document_total_with_vat_hal = COALESCE(document_total_with_vat_hal,");
    expect(extractionWrite().params).toContain(123450);

    capturedQueries.length = 0;
    mockExtractStructuredReceipt.mockResolvedValue(baseExtracted({ totalWithVat: 0 }));
    await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(extractionWrite().params).not.toContain(0);
  });

  it("selhání před zápisem označí 'failed' jen pro claim tohoto pokusu (updated_at z claimu)", async () => {
    mockPerformReceiptOcr.mockRejectedValueOnce(new Error("OCR down"));
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    await triggerGoodsReceiptExtraction(RECEIPT_ID);
    const failed = capturedQueries.find((q) => q.sql.startsWith('update "goods_receipts" set "extraction_status"'))!;
    expect(failed.sql).toContain('"goods_receipts"."extraction_status" = $');
    expect(failed.sql).toContain('"goods_receipts"."updated_at" = $');
  });
});

describe("triggerGoodsReceiptExtraction — DPH se vždy dopočítá, model se nevěří (bod 4 zadání)", () => {
  it("zapsaný řádek má vat_hal dopočítané appkou, NE modelovo vatAmount (999999)", async () => {
    mockExtractStructuredReceipt.mockResolvedValue(
      baseExtracted({ lines: [baseExtractedLine({ totalWithoutVat: 100, totalWithVat: 121, vatAmount: 999999 })] })
    );
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    expect(writtenLines()[0].vat_hal).toBe(2100); // 12100 - 10000, nikdy 999999 * 100
    expect(JSON.stringify(writtenLines())).not.toContain("99999900");
  });
});

describe("triggerGoodsReceiptExtraction — mapování položek (body 6+7 zadání)", () => {
  it("známé mapování (podle supplier_id + supplier_item_code) se předvyplní automaticky, last_used_at se bumpne", async () => {
    mappingByCodeRow = ["mapping-1", "item-known", "resale_goods", "l"];
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    expect(writtenLines()[0]).toMatchObject({ stock_item_id: "item-known", mapping_source: "auto" });
    expect(capturedQueries.some((q) => q.sql.startsWith('update "supplier_item_mappings" set "last_used_at"'))).toBe(true);
  });

  it("popis je jen FALLBACK — s vyplněným kódem se mapování podle popisu vůbec nehledá", async () => {
    mappingByCodeRow = null;
    mappingByDescriptionRow = ["mapping-2", "item-by-desc", "resale_goods", "l"];
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID); // line má supplierItemCode="123"
    expect(result.ok).toBe(true);
    // kód "123" nemá známé mapování (mappingByCodeRow=null) a POPIS se jako
    // fallback nepoužije, protože kód byl vyplněný — položka zůstane
    // nenamapovaná (mapping_source NULL), i když "mappingByDescriptionRow"
    // existuje.
    expect(writtenLines()[0].stock_item_id).toBeNull();
  });

  it("neznámá položka (žádné mapování) → nenamapováno (stock_item_id NULL, mapping_source NULL), kategorie = AI návrh", async () => {
    mockExtractStructuredReceipt.mockResolvedValue(
      baseExtracted({ lines: [baseExtractedLine({ supplierItemCode: null, suggestedCategory: "operating_supply" })] })
    );
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    expect(writtenLines()[0]).toMatchObject({ stock_item_id: null, line_kind: "operating_supply", mapping_source: null });
    // Návrh (kategorie/karta/jednotka) se uloží do extraction_raw pro
    // kontrolní obrazovku, ne přímo jako potvrzené mapování (bod 7 zadání).
    const extractionRawJson = JSON.stringify(extractionWrite().params);
    expect(extractionRawJson).toContain("operating_supply");
    expect(extractionRawJson).toContain("Pivo 12°");
  });

  it("reálný nález (MAKRO faktura): nenamapovaná položka uloží jednotku Z DOKLADU (rawUnit), NIKDY nezávazný AI návrh kanonické jednotky (suggestedCanonicalUnit) — 'balení' se tak kontrolorovi nezobrazí jako 'kg'", async () => {
    mappingByCodeRow = null;
    mappingByDescriptionRow = null;
    mockExtractStructuredReceipt.mockResolvedValue(
      baseExtracted({
        lines: [
          baseExtractedLine({
            description: "Hranolky 6x6 2,5kg",
            supplierItemCode: "456",
            unit: "BG", // skutečná jednotka z dokladu — 1 BALENÍ (sáček)
            suggestedCanonicalUnit: "kg", // AI návrh pro BUDOUCÍ skladovou kartu — NENÍ jednotka nákupu
          }),
        ],
      })
    );
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);

    expect(writtenLines()[0]).toMatchObject({ raw_unit: "BG", normalized_unit: "BG" }); // normalizedUnit = rawUnit (z dokladu)
    expect(JSON.stringify(writtenLines())).not.toContain('"kg"'); // NE AI návrh — ten by se tvářil jako ověřená jednotka nákupu

    // AI návrh zůstává dál dostupný pro kontrolní obrazovku (založení NOVÉ
    // skladové karty), jen se nepoužije jako jednotka TÉHLE položky.
    expect(JSON.stringify(extractionWrite().params)).toContain("kg");
  });
});

describe("triggerGoodsReceiptExtraction — soukromá položka nikdy nedostane skladovou kartu (bod 8 zadání)", () => {
  it("suggestedCategory='non_stock_private' bez známého mapování → stock_item_id NULL, line_kind='non_stock_private'", async () => {
    mockExtractStructuredReceipt.mockResolvedValue(
      baseExtracted({
        lines: [baseExtractedLine({ description: "Osobní nákup", supplierItemCode: null, suggestedCategory: "non_stock_private" })],
      })
    );
    const { triggerGoodsReceiptExtraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptExtraction(RECEIPT_ID);
    expect(result.ok).toBe(true);
    expect(writtenLines()[0]).toMatchObject({ line_kind: "non_stock_private", stock_item_id: null });
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

  it("druh řádku ≠ druh skladové karty → {ok:false}, nic se nezapíše (jeden slovník druhů karta = řádek)", async () => {
    stockItemKind = "stock_material";
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    const result = await confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", {
      stockItemId: "item-1",
      lineKind: "resale_goods",
      rememberMapping: true,
    });
    expect(result).toEqual({
      ok: false,
      error: "Druh řádku (Zboží k prodeji) neodpovídá druhu skladové karty (Skladová surovina).",
    });
    expect(capturedQueries.some((q) => /^(update|insert)/.test(q.sql))).toBe(false);
  });

  it("surovina (stock_material) jde namapovat na kartu suroviny — dřív karta „ingredient“ × řádek „stock_material“ nešla nikdy", async () => {
    stockItemKind = "stock_material";
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    const result = await confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", {
      stockItemId: "item-1",
      lineKind: "stock_material",
      rememberMapping: false,
    });
    expect(result).toEqual({ ok: true });
  });

  it("potvrzení nastaví mapping_source='manual' (i pro AI návrh, jakmile ho člověk potvrdí)", async () => {
    const { confirmGoodsReceiptLineMapping } = await import("../skladExtraction");
    const result = await confirmGoodsReceiptLineMapping(RECEIPT_ID, "line-1", {
      stockItemId: "item-1",
      lineKind: "resale_goods",
      rememberMapping: false,
    });
    expect(result.ok).toBe(true);
    const lineUpdate = capturedQueries.find((q) => q.sql.startsWith('update "goods_receipt_lines" set'))!;
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
