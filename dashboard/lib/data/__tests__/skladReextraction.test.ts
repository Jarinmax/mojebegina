// @vitest-environment node
//
// "Znovu přečíst doklad" — opakované AI vytěžení draft příjemky, co už
// může mít goods_receipt_lines. Zadání: původní řádky se zachovají, nový
// výsledek čeká ODDĚLENĚ na porovnání, nahradí je až po výslovném
// převzetí; chyba nesmí poškodit ani jen signalizovat změnu existujících
// dat; potvrzené příjemky appka nemění; žádná duplicitní příjemka.
//
// Stejná mock technika jako skladExtraction.test.ts/skladUpload.test.ts
// (stub "server-only", nahradit @neondatabase/serverless transport
// špionem) — SQL fragmenty v matcherech níž ověřeny reálným diagnostickým
// během (console.log skutečného výstupu), ne odhadnuté. Pořadí
// delete→insert v acceptGoodsReceiptReextraction (riziko porušení unique
// indexu na position) je ověřeno samostatně nad REÁLNOU Postgres
// sémantikou v skladReextractionPglite.test.ts — mock transport tady
// dokazuje jen orchestraci/oprávnění/gating, ne skutečné pořadí CTE.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "../types";

vi.mock("server-only", () => ({}));

type CapturedQuery = { sql: string; params: unknown[] };
const capturedQueries: CapturedQuery[] = [];

const RECEIPT_ID = "33333333-3333-3333-3333-333333333333";
const SUPPLIER_ID = "44444444-4444-4444-4444-444444444444";

let receiptStatus: string | null = "draft";
let reextractionStatus = "none";
let reextractionRaw: unknown = null;
let acceptClaimSucceeds = true;
let discardClaimSucceeds = true;
let triggerClaimSucceeds = true;
let triggerFinalWriteSucceeds = true;
// Simuluje AKTUÁLNÍ (živý) stav goods_receipt_lines — čte ho jak nový
// claim na začátku triggerGoodsReceiptReextraction (uloží si snímek), tak
// precheck na začátku acceptGoodsReceiptReextraction (porovná s uloženým
// snímkem). Výchozí hodnoty odpovídají SAMPLE_RAW_LINE/sampleReextractionRaw
// níž, aby „beze změny“ byl výchozí stav a testy manuální úpravy ho
// explicitně rozladily.
let liveLinesCount = 1;
let liveLinesMaxUpdatedAtText: string | null = "2026-10-11T11:00:00.000Z";

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

    // getGoodsReceiptReextractionPreview
    if (sqlText.startsWith('select "reextraction_status", "reextraction_raw"')) {
      if (!receiptStatus) return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
      return Promise.resolve({ rows: [[reextractionStatus, reextractionRaw]], rowCount: 1, fields: [] });
    }
    // acceptGoodsReceiptReextraction — select receipt
    if (sqlText.startsWith('select "id", "status", "reextraction_status", "reextraction_raw"')) {
      if (!receiptStatus) return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
      return Promise.resolve({ rows: [[RECEIPT_ID, receiptStatus, reextractionStatus, reextractionRaw]], rowCount: 1, fields: [] });
    }
    // acceptGoodsReceiptReextraction — big CTE
    if (sqlText.includes("WITH claimed AS") && sqlText.includes("extraction_status = 'needs_review'")) {
      const rows = acceptClaimSucceeds ? [[RECEIPT_ID]] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    // acceptGoodsReceiptReextraction (precheck) / triggerGoodsReceiptReextraction
    // (snímek při claimu) — db.execute() vrací OBJEKTOVÉ řádky (ne pole),
    // stejně jako skutečný neon-http ovladač v ne-array módu.
    if (sqlText.includes("max(updated_at)")) {
      return Promise.resolve({
        rows: [{ count: String(liveLinesCount), max_updated_at: liveLinesMaxUpdatedAtText }],
        rowCount: 1,
        fields: [],
      });
    }
    // discardGoodsReceiptReextraction
    if (sqlText.includes("UPDATE goods_receipts") && sqlText.includes("reextraction_status = 'none'")) {
      const rows = discardClaimSucceeds ? [[RECEIPT_ID]] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    // triggerGoodsReceiptReextraction — fetchReceiptStatusForReextraction
    if (sqlText.includes('"id", "status", "supplier_id", "document_number", "document_date", "payment_method", "reextraction_status"')) {
      if (!receiptStatus) return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
      return Promise.resolve({ rows: [[RECEIPT_ID, receiptStatus, SUPPLIER_ID, null, null, null, reextractionStatus]], rowCount: 1, fields: [] });
    }
    // triggerGoodsReceiptReextraction — claim
    if (sqlText.includes("UPDATE goods_receipts") && sqlText.includes("reextraction_status = 'pending'")) {
      const rows = triggerClaimSucceeds ? [[RECEIPT_ID]] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    // pages
    if (sqlText.startsWith('select "goods_receipt_document_pages"')) {
      return Promise.resolve({ rows: [["sklad/r1/p1.jpg", "image/jpeg"]], rowCount: 1, fields: [] });
    }
    // supplier lookups — none found, keep existing supplier (not under test here)
    if (sqlText.startsWith('select "id", "name" from "suppliers"')) {
      return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
    }
    // item mapping lookup — none found
    if (sqlText.startsWith('select "supplier_item_mappings"."id"')) {
      return Promise.resolve({ rows: [], rowCount: 0, fields: [] });
    }
    // final "ready" write — gatované reextraction_claimed_at, .returning("id")
    if (sqlText.startsWith('update "goods_receipts" set "reextraction_status" = $1, "reextraction_raw"')) {
      const rows = triggerFinalWriteSucceeds ? [{ id: RECEIPT_ID }] : [];
      return Promise.resolve({ rows, rowCount: rows.length, fields: [] });
    }
    // markReextractionFailed — také gatované reextraction_claimed_at, beze
    // čtení výsledku (appka ho bere jako best-effort, nekontroluje rows).
    if (sqlText.startsWith('update "goods_receipts" set "reextraction_status" = $1, "updated_at"')) {
      return Promise.resolve({ rows: [], rowCount: 1, fields: [] });
    }
    if (sqlText.startsWith('insert into "goods_receipt_activity"')) {
      return Promise.resolve({ rows: [["activity-1"]], rowCount: 1, fields: [] });
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

const mockExtractStructuredReceipt = vi.fn();
vi.mock("../receiptExtractionModel", () => ({
  extractStructuredReceipt: (...args: unknown[]) => mockExtractStructuredReceipt(...args),
  EXTRACTION_MODEL_ID: "openai/gpt-5-nano",
}));

const mockPerformReceiptOcr = vi.fn<(images: unknown[], receiptId: string) => Promise<string>>();
vi.mock("../receiptOcrModel", () => ({
  performReceiptOcr: (images: unknown[], receiptId: string) => mockPerformReceiptOcr(images, receiptId),
  OCR_MODEL_ID: "alibaba/qwen3-vl-instruct",
  MIN_OCR_TEXT_LENGTH: 30,
}));

vi.mock("../receiptImagePreprocessing", () => ({
  preprocessReceiptPage: (image: { mimeType: string; bytes: Buffer }) =>
    Promise.resolve({
      images: [image],
      diagnostics: { originalWidth: 800, originalHeight: 1200, crop: null, bandDimensions: [{ width: 800, height: 1200 }] },
    }),
}));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const STRELEC = "fdc7b836-2325-4568-b9b7-5ac579cd8972";

function ctxFor(userId: string): AuthContext {
  return { userId, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Test", email: "t@example.com" };
}

const SAMPLE_RAW_LINE = {
  position: 1,
  rawDescription: "Pivo 12°",
  supplierItemCode: null,
  supplierAuxiliaryCode: null,
  rawPackageQuantity: 1,
  rawUnitsPerPackage: 1,
  rawUnit: "ks",
  normalizedQuantity: 1,
  normalizedUnit: "ks",
  unitPriceWithoutVat: 10,
  totalWithoutVatHal: 1000,
  vatHal: 210,
  totalWithVatHal: 1210,
  computedVatRatePercent: 21,
  stockItemId: null,
  lineKind: "stock_material",
  mappingSource: null,
  suggestion: null,
};

function sampleReextractionRaw(overrides: Record<string, unknown> = {}) {
  return {
    extractedAt: "2026-10-11T12:00:00.000Z",
    ocrModel: "alibaba/qwen3-vl-instruct",
    model: "openai/gpt-5-nano",
    droppedLineCount: 0,
    supplierIdCandidate: null,
    supplierNameCandidate: null,
    documentNumber: null,
    documentDate: null,
    paymentMethod: null,
    totalWithoutVat: 10,
    totalVat: 2.1,
    totalWithVat: 12.1,
    lines: [SAMPLE_RAW_LINE],
    linesSnapshot: { count: 1, maxUpdatedAtText: "2026-10-11T11:00:00.000Z" },
    ...overrides,
  };
}

function extractedReceiptLine(overrides: Record<string, unknown> = {}) {
  return {
    description: "Pivo 12°",
    supplierItemCode: null,
    supplierAuxiliaryCode: null,
    packageQuantity: 1,
    unitsPerPackage: 1,
    unit: "ks",
    unitPriceWithoutVat: 10,
    totalWithoutVat: 10,
    vatAmount: 2.1,
    totalWithVat: 12.1,
    suggestedCategory: null,
    suggestedStockItemName: null,
    suggestedCanonicalUnit: null,
    ...overrides,
  };
}

beforeEach(() => {
  capturedQueries.length = 0;
  receiptStatus = "draft";
  reextractionStatus = "none";
  reextractionRaw = null;
  acceptClaimSucceeds = true;
  discardClaimSucceeds = true;
  triggerClaimSucceeds = true;
  triggerFinalWriteSucceeds = true;
  liveLinesCount = 1;
  liveLinesMaxUpdatedAtText = "2026-10-11T11:00:00.000Z";
  mockGetAuthContext.mockReset();
  mockGet.mockReset();
  mockExtractStructuredReceipt.mockReset();
  mockPerformReceiptOcr.mockReset();
});

describe("triggerGoodsReceiptReextraction — spouští se NEZÁVISLE na existujících řádcích", () => {
  it("draft příjemka s reextraction_status='none' → claim projde i BEZ 'NOT EXISTS (řádky)' podmínky (na rozdíl od prvního vytěžení)", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    mockGet.mockResolvedValue({ statusCode: 200, stream: makeBlobStream(new Uint8Array([1, 2, 3])) });
    mockPerformReceiptOcr.mockResolvedValue("=== VÝŘEZ 1 ===\nPivo 12° 1 ks 100,00 Kč dostatečně dlouhý text");
    mockExtractStructuredReceipt.mockResolvedValue({
      supplierName: "Test",
      supplierIco: null,
      supplierDic: null,
      documentNumber: null,
      documentDate: null,
      paymentMethod: null,
      lines: [extractedReceiptLine()],
      totalWithoutVat: 10,
      totalVat: 2.1,
      totalWithVat: 12.1,
    });

    const { triggerGoodsReceiptReextraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({ ok: true });

    // Appka SMÍ číst goods_receipt_lines (snímek pro ochranu ručních úprav
    // — viz accept testy níž), ale ŽÁDNÝ dotaz nesmí blokovat na JEJICH
    // EXISTENCI/POČTU — to je přesně ten rozdíl oproti
    // triggerGoodsReceiptExtraction výš v souboru (ten vyžaduje "NOT
    // EXISTS (řádky)" jako podmínku claimu).
    expect(capturedQueries.some((q) => q.sql.includes("NOT EXISTS") && q.sql.includes("goods_receipt_lines"))).toBe(false);
    const linesSnapshotQuery = capturedQueries.find((q) => q.sql.includes("max(updated_at)"));
    expect(linesSnapshotQuery).toBeDefined();
    // Úspěch zapisuje jen reextraction_status/_raw, NIKDY extraction_status.
    const finalUpdate = capturedQueries.find((q) => q.sql.startsWith('update "goods_receipts" set "reextraction_status" = $1, "reextraction_raw"'));
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate!.sql).not.toContain("\"extraction_status\"");
  });

  it("příjemka 'confirmed' → odmítne se, appka potvrzené příjemky nemění", async () => {
    receiptStatus = "confirmed";
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { triggerGoodsReceiptReextraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptReextraction(RECEIPT_ID);
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("Znovu přečíst lze jen návrh příjemky");
    expect(capturedQueries.some((q) => q.sql.includes("UPDATE goods_receipts") && q.sql.includes("reextraction_status = 'pending'"))).toBe(false);
  });

  it("claim selže, protože výsledek 'ready' už čeká na rozhodnutí → appka řekne, že se musí nejdřív vyřešit, bez druhého (placeného) pokusu", async () => {
    reextractionStatus = "ready";
    triggerClaimSucceeds = false;
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { triggerGoodsReceiptReextraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({
      ok: false,
      error: "Nový výsledek už čeká na porovnání — nejdřív ho na příjemce zkontrolujte a převezměte nebo zahoďte.",
      kind: "technical",
    });
    expect(mockPerformReceiptOcr).not.toHaveBeenCalled();
  });

  it("finishReason 'length' (ModelOutputTruncatedError) → reextraction_status='failed', NIKDY markExtractionFailed/extraction_status", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    mockGet.mockResolvedValue({ statusCode: 200, stream: makeBlobStream(new Uint8Array([1, 2, 3])) });
    const { ModelOutputTruncatedError } = await import("../aiCallDiagnostics");
    mockPerformReceiptOcr.mockRejectedValue(new ModelOutputTruncatedError("ocr"));

    const { triggerGoodsReceiptReextraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({
      ok: false,
      error: "Nové čtení dokladu se nepodařilo dokončit — model dosáhl limitu délky výstupu. Původní řádky zůstávají beze změny. Zkuste to znovu.",
      kind: "technical",
    });
    const failedUpdate = capturedQueries.find((q) => q.sql.startsWith('update "goods_receipts" set "reextraction_status"'));
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate!.sql).not.toContain("\"extraction_status\"");
  });

  it("0 použitelných řádků po sanitizaci → 'unreadable', reassure zprávou, že původní řádky zůstávají beze změny", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    mockGet.mockResolvedValue({ statusCode: 200, stream: makeBlobStream(new Uint8Array([1, 2, 3])) });
    mockPerformReceiptOcr.mockResolvedValue("=== VÝŘEZ 1 ===\ndostatečně dlouhý nečitelný text pro MIN_OCR_TEXT_LENGTH");
    mockExtractStructuredReceipt.mockResolvedValue({
      supplierName: null,
      supplierIco: null,
      supplierDic: null,
      documentNumber: null,
      documentDate: null,
      paymentMethod: null,
      lines: [],
      totalWithoutVat: null,
      totalVat: null,
      totalWithVat: null,
    });

    const { triggerGoodsReceiptReextraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptReextraction(RECEIPT_ID);
    expect(result.ok).toBe(false);
    expect((result as { kind: string }).kind).toBe("unreadable");
    expect((result as { error: string }).error).toContain("Původní řádky zůstávají beze změny");
  });

  it("ochrana proti opožděnému výsledku staršího pokusu: finální zápis je gatovaný reextraction_claimed_at a appka NEOZNAČÍ supersednutý pokus za úspěch", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    mockGet.mockResolvedValue({ statusCode: 200, stream: makeBlobStream(new Uint8Array([1, 2, 3])) });
    mockPerformReceiptOcr.mockResolvedValue("=== VÝŘEZ 1 ===\nPivo 12° 1 ks 100,00 Kč dostatečně dlouhý text");
    mockExtractStructuredReceipt.mockResolvedValue({
      supplierName: "Test",
      supplierIco: null,
      supplierDic: null,
      documentNumber: null,
      documentDate: null,
      paymentMethod: null,
      lines: [extractedReceiptLine()],
      totalWithoutVat: 10,
      totalVat: 2.1,
      totalWithVat: 12.1,
    });
    // Simuluje: mezitím co TENHLE pokus čekal na model, začal/doběhl
    // novější pokus a přepsal reextraction_claimed_at — finální zápis
    // tohohle (starého) pokusu proto gate nesplní.
    triggerFinalWriteSucceeds = false;

    const { triggerGoodsReceiptReextraction } = await import("../skladExtraction");
    const result = await triggerGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({
      ok: false,
      error: "Tenhle pokus o nové čtení byl mezitím nahrazen novějším. Zkontrolujte aktuální stav příjemky.",
      kind: "technical",
    });
    // Supersednutý pokus nesmí zalogovat aktivitu — ta by lhala o tom, co
    // je skutečně uložené (novější pokus má své vlastní, jiné řádky).
    expect(capturedQueries.some((q) => q.sql.startsWith('insert into "goods_receipt_activity"'))).toBe(false);
  });

  it("claim UPDATE zapisuje reextraction_claimed_at jako parametr z JS (ne SQL now()), aby šel stejný token znovu použít jako gate", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    mockGet.mockResolvedValue({ statusCode: 200, stream: makeBlobStream(new Uint8Array([1, 2, 3])) });
    mockPerformReceiptOcr.mockResolvedValue("=== VÝŘEZ 1 ===\nPivo 12° 1 ks 100,00 Kč dostatečně dlouhý text");
    mockExtractStructuredReceipt.mockResolvedValue({
      supplierName: "Test",
      supplierIco: null,
      supplierDic: null,
      documentNumber: null,
      documentDate: null,
      paymentMethod: null,
      lines: [extractedReceiptLine()],
      totalWithoutVat: 10,
      totalVat: 2.1,
      totalWithVat: 12.1,
    });

    const { triggerGoodsReceiptReextraction } = await import("../skladExtraction");
    await triggerGoodsReceiptReextraction(RECEIPT_ID);

    const claimQuery = capturedQueries.find((q) => q.sql.includes("reextraction_status = 'pending'"));
    expect(claimQuery).toBeDefined();
    expect(claimQuery!.sql).not.toContain("reextraction_claimed_at = now()");
    expect(claimQuery!.params.some((p) => p instanceof Date)).toBe(true);

    const finalWrite = capturedQueries.find((q) => q.sql.startsWith('update "goods_receipts" set "reextraction_status" = $1, "reextraction_raw"'));
    expect(finalWrite).toBeDefined();
    expect(finalWrite!.sql).toContain('"reextraction_claimed_at" = $');
  });
});

describe("acceptGoodsReceiptReextraction — jediné místo, kde se řádky nahradí", () => {
  it("requireReviewAccess — Jiří Střelec (jen ceny/originál) nemá oprávnění převzít", async () => {
    reextractionStatus = "ready";
    reextractionRaw = sampleReextractionRaw();
    mockGetAuthContext.mockResolvedValue(ctxFor(STRELEC));
    const { acceptGoodsReceiptReextraction } = await import("../sklad");
    await expect(acceptGoodsReceiptReextraction(RECEIPT_ID)).rejects.toThrow();
    expect(capturedQueries.some((q) => q.sql.includes("WITH claimed AS"))).toBe(false);
  });

  it("příjemka 'confirmed' → odmítne se beze zápisu, potvrzené příjemky appka nemění", async () => {
    receiptStatus = "confirmed";
    reextractionStatus = "ready";
    reextractionRaw = sampleReextractionRaw();
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { acceptGoodsReceiptReextraction } = await import("../sklad");
    const result = await acceptGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({ ok: false, error: "Potvrzené a stornované příjemky appka nemění — nový výsledek nelze převzít." });
    expect(capturedQueries.some((q) => q.sql.includes("WITH claimed AS"))).toBe(false);
  });

  it("reextraction_status není 'ready' → odmítne se, nic nekompletního se nepřevezme", async () => {
    reextractionStatus = "pending";
    reextractionRaw = null;
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { acceptGoodsReceiptReextraction } = await import("../sklad");
    const result = await acceptGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({ ok: false, error: "Žádný výsledek nového čtení nečeká na převzetí." });
  });

  it("ready + validní výsledek → zapíše jediný atomický příkaz, co nahradí řádky a vrátí extraction_status na 'needs_review'", async () => {
    reextractionStatus = "ready";
    reextractionRaw = sampleReextractionRaw();
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { acceptGoodsReceiptReextraction } = await import("../sklad");
    const result = await acceptGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({ ok: true });

    const cte = capturedQueries.find((q) => q.sql.includes("WITH claimed AS"));
    expect(cte).toBeDefined();
    expect(cte!.sql).toContain("extraction_status = 'needs_review'");
    expect(cte!.sql).toContain("reextraction_status = 'none'");
    expect(cte!.sql).toContain("DELETE FROM goods_receipt_lines");
    expect(cte!.sql).toContain("jsonb_to_recordset");
    // Zápis závisí JEN na reextraction_status='ready' — appka nikdy
    // nekontroluje počet existujících řádků (0 i 8 musí dopadnout stejně).
    expect(cte!.sql).not.toContain("NOT EXISTS");
  });

  it("claim v atomickém příkazu vrátí 0 řádků (mezitím se stav změnil) → appka to ohlásí, ne tiše selže", async () => {
    reextractionStatus = "ready";
    reextractionRaw = sampleReextractionRaw();
    acceptClaimSucceeds = false;
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { acceptGoodsReceiptReextraction } = await import("../sklad");
    const result = await acceptGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({ ok: false, error: "Nový výsledek se nepodařilo převzít — mezitím se stav příjemky změnil." });
  });

  it("příjemka 'voided' → odmítne se beze zápisu, appka stornované příjemky nemění (ne jen 'confirmed')", async () => {
    receiptStatus = "voided";
    reextractionStatus = "ready";
    reextractionRaw = sampleReextractionRaw();
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { acceptGoodsReceiptReextraction } = await import("../sklad");
    const result = await acceptGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({ ok: false, error: "Potvrzené a stornované příjemky appka nemění — nový výsledek nelze převzít." });
    expect(capturedQueries.some((q) => q.sql.includes("WITH claimed AS"))).toBe(false);
  });

  it("ochrana ručních úprav provedených BĚHEM nového čtení: počet řádků se mezitím změnil → převzetí se odmítne, atomický zápis se vůbec nepokusí", async () => {
    reextractionStatus = "ready";
    reextractionRaw = sampleReextractionRaw(); // snapshot: count=1, maxUpdatedAtText="2026-10-11T11:00:00.000Z"
    liveLinesCount = 2; // mezitím přibyl ruční řádek
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { acceptGoodsReceiptReextraction } = await import("../sklad");
    const result = await acceptGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({
      ok: false,
      error:
        "Řádky se od spuštění nového čtení ručně změnily — nový výsledek by tyhle změny přepsal. Zkontrolujte aktuální řádky, případně spusťte nové čtení znovu.",
    });
    expect(capturedQueries.some((q) => q.sql.includes("WITH claimed AS"))).toBe(false);
  });

  it("ochrana ručních úprav: stejný POČET, ale novější max(updated_at) (oprava existujícího řádku) → taky se odmítne", async () => {
    reextractionStatus = "ready";
    reextractionRaw = sampleReextractionRaw();
    liveLinesCount = 1;
    liveLinesMaxUpdatedAtText = "2026-10-11T23:59:59.000Z"; // řádek byl mezitím ručně upraven
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { acceptGoodsReceiptReextraction } = await import("../sklad");
    const result = await acceptGoodsReceiptReextraction(RECEIPT_ID);
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("ručně změnily");
  });

  it("atomický zápis má VLASTNÍ (TOCTOU-bezpečnou) kontrolu snímku řádků přímo v gatu, ne jen v precheck selectu", async () => {
    reextractionStatus = "ready";
    reextractionRaw = sampleReextractionRaw();
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { acceptGoodsReceiptReextraction } = await import("../sklad");
    await acceptGoodsReceiptReextraction(RECEIPT_ID);

    const cte = capturedQueries.find((q) => q.sql.includes("WITH claimed AS"));
    expect(cte).toBeDefined();
    expect(cte!.sql).toContain("(SELECT count(*) FROM goods_receipt_lines WHERE receipt_id = $");
    expect(cte!.sql).toContain("IS NOT DISTINCT FROM $");
  });
});

describe("discardGoodsReceiptReextraction — zahodí hotový/neúspěšný výsledek beze stopy na řádcích", () => {
  it("'ready' → reset na 'none', NIKDY nesahá na goods_receipt_lines", async () => {
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { discardGoodsReceiptReextraction } = await import("../sklad");
    const result = await discardGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({ ok: true });
    expect(capturedQueries.some((q) => q.sql.includes("goods_receipt_lines"))).toBe(false);
  });

  it("'none'/'pending' (nic k zahození) → claim selže, appka to ohlásí", async () => {
    discardClaimSucceeds = false;
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { discardGoodsReceiptReextraction } = await import("../sklad");
    const result = await discardGoodsReceiptReextraction(RECEIPT_ID);
    expect(result).toEqual({ ok: false, error: "Nic k zahození — žádný výsledek nového čtení nečeká." });
  });
});

describe("getGoodsReceiptReextractionPreview", () => {
  it("status 'ready' → vrátí uložený raw výsledek k porovnání", async () => {
    reextractionStatus = "ready";
    reextractionRaw = sampleReextractionRaw();
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { getGoodsReceiptReextractionPreview } = await import("../skladExtraction");
    const result = await getGoodsReceiptReextractionPreview(RECEIPT_ID);
    expect(result?.status).toBe("ready");
    expect(result?.raw?.lines).toHaveLength(1);
  });

  it("status 'none' → raw je null, i kdyby v DB něco zbylo ze staršího pokusu", async () => {
    reextractionStatus = "none";
    reextractionRaw = sampleReextractionRaw(); // nemělo by se stát, ale appka musí ignorovat raw mimo 'ready'
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { getGoodsReceiptReextractionPreview } = await import("../skladExtraction");
    const result = await getGoodsReceiptReextractionPreview(RECEIPT_ID);
    expect(result).toEqual({ status: "none", raw: null });
  });

  it("příjemka neexistuje → null", async () => {
    receiptStatus = null;
    mockGetAuthContext.mockResolvedValue(ctxFor(VINER));
    const { getGoodsReceiptReextractionPreview } = await import("../skladExtraction");
    const result = await getGoodsReceiptReextractionPreview(RECEIPT_ID);
    expect(result).toBeNull();
  });
});
