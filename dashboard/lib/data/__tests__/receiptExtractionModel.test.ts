// @vitest-environment node
//
// Mobilní tok 1.0 — po reálném nálezu (MAKRO faktura, testovací příjemka
// na Preview: UI mělo jen 8 z 16 položek z fotky): appka dřív
// finishReason/usage z téhle fáze vůbec nečetla. Testuje se JEN tenhle
// jeden export (extractStructuredReceipt), generateText je zmockované —
// appka NIKDY nedělá skutečné (natož placené) volání modelu v testech.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelOutputTruncatedError } from "../aiCallDiagnostics";

vi.mock("server-only", () => ({}));

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  // Appka jen zabalí schéma do volání generateText — skutečné
  // strukturování/validaci dělá zmockované generateText výš, takže stačí
  // identita (appka na výsledku Output.object() samotném nic netestuje).
  Output: { object: (config: unknown) => config },
}));
vi.mock("@ai-sdk/gateway", () => ({
  gateway: (modelId: string) => ({ modelId }),
}));

const RECEIPT_ID = "33333333-3333-3333-3333-333333333333";

function baseRawOutput(overrides: Record<string, unknown> = {}) {
  return {
    supplierName: "Test",
    supplierIco: null,
    supplierDic: null,
    documentNumber: null,
    documentDate: null,
    paymentMethod: null,
    lines: [],
    totalWithoutVat: 0,
    totalVat: 0,
    totalWithVat: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockGenerateText.mockReset();
});

describe("extractStructuredReceipt — detekce useknutého výstupu (ModelOutputTruncatedError)", () => {
  it("finishReason 'stop' → appka vrátí strukturovaný výstup normálně", async () => {
    const rawOutput = baseRawOutput({ supplierName: "MAKRO" });
    mockGenerateText.mockResolvedValueOnce({
      output: rawOutput,
      finishReason: "stop",
      usage: { inputTokens: 1000, outputTokens: 800, totalTokens: 1800 },
    });
    const { extractStructuredReceipt } = await import("../receiptExtractionModel");
    const result = await extractStructuredReceipt("=== VÝŘEZ 1 ===\nOCR text…", RECEIPT_ID);
    expect(result).toEqual(rawOutput);
  });

  it("finishReason 'length' → appka NEPŘIJME částečný výstup jako dokončené strukturování, vyhodí ModelOutputTruncatedError(phase='structuring'), a NIKDY nesahá na result.output", async () => {
    let outputAccessed = false;
    mockGenerateText.mockResolvedValueOnce({
      get output() {
        // `.output` je v reálném SDK getter, co při finishReason jiném než
        // "stop" může sám vyhodit NoOutputGeneratedError (viz komentář v
        // receiptExtractionModel.ts) — appka proto čte finishReason PŘED
        // output. Tenhle getter dokazuje, že se output při "length"
        // vůbec nezkouší přečíst.
        outputAccessed = true;
        throw new Error("output se nikdy neměl číst po finishReason='length'");
      },
      finishReason: "length",
      usage: { inputTokens: 1000, outputTokens: 4096, totalTokens: 5096 },
    });
    const { extractStructuredReceipt } = await import("../receiptExtractionModel");

    let caught: unknown;
    try {
      await extractStructuredReceipt("=== VÝŘEZ 1 ===\nOCR text…", RECEIPT_ID);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ModelOutputTruncatedError);
    expect((caught as InstanceType<typeof ModelOutputTruncatedError>).phase).toBe("structuring");
    expect(outputAccessed).toBe(false);
  });

  it("loguje jen bezpečná metadata — NIKDY OCR text poslaný modelu ani obsah strukturovaného výstupu", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const secretOcrText = "Jan Novák, RČ 900101/1234 — OCR přepis účtenky";
    mockGenerateText.mockResolvedValueOnce({
      output: baseRawOutput({ supplierName: "Tajný dodavatel s.r.o." }),
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
    const { extractStructuredReceipt } = await import("../receiptExtractionModel");
    await extractStructuredReceipt(secretOcrText, RECEIPT_ID);

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const loggedJson = JSON.stringify(consoleLogSpy.mock.calls);
    expect(loggedJson).toContain(RECEIPT_ID);
    expect(loggedJson).toContain("structuring");
    expect(loggedJson).toContain("stop");
    expect(loggedJson).not.toContain(secretOcrText);
    expect(loggedJson).not.toContain("Jan Novák");
    expect(loggedJson).not.toContain("Tajný dodavatel");
  });

  it("i při useknutí (finishReason 'length') se diagnostika zaloguje PŘED vyhozením chyby", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockGenerateText.mockResolvedValueOnce({
      get output(): never {
        throw new Error("nemělo se číst");
      },
      finishReason: "length",
      usage: { inputTokens: 1000, outputTokens: 4096, totalTokens: 5096 },
    });
    const { extractStructuredReceipt } = await import("../receiptExtractionModel");
    await expect(extractStructuredReceipt("OCR text…", RECEIPT_ID)).rejects.toThrow(ModelOutputTruncatedError);

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const loggedJson = JSON.stringify(consoleLogSpy.mock.calls);
    expect(loggedJson).toContain("length");
  });
});

describe("extractStructuredReceipt — limity volání (blokující bod 8)", () => {
  it("bez automatického opakování, s horním limitem výstupu a časovým limitem", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "x", output: { lines: [] }, finishReason: "stop", usage: {} });
    const { extractStructuredReceipt } = await import("../receiptExtractionModel");
    await extractStructuredReceipt("OCR text", RECEIPT_ID);
    const { AI_CALL_TIMEOUT_MS, STRUCTURING_MAX_OUTPUT_TOKENS } = await import("../aiCallDiagnostics");
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0, maxOutputTokens: STRUCTURING_MAX_OUTPUT_TOKENS, timeout: { totalMs: AI_CALL_TIMEOUT_MS } })
    );
  });
});
