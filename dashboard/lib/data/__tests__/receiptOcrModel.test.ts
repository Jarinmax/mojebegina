// @vitest-environment node
//
// Mobilní tok 1.0 — po reálném nálezu (MAKRO faktura, testovací příjemka
// na Preview: UI mělo jen 8 z 16 položek z fotky): appka dřív
// finishReason/usage z téhle fáze vůbec nečetla, takže neuměla poznat,
// jestli model skončil přirozeně, nebo mu došel výstupní limit uprostřed
// přepisu. Testuje se JEN tenhle jeden export (performReceiptOcr),
// generateText je zmockované — appka NIKDY nedělá skutečné (natož
// placené) volání modelu v testech.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelOutputTruncatedError } from "../aiCallDiagnostics";

vi.mock("server-only", () => ({}));

const mockGenerateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));
vi.mock("@ai-sdk/gateway", () => ({
  gateway: (modelId: string) => ({ modelId }),
}));

const RECEIPT_ID = "33333333-3333-3333-3333-333333333333";
const SOME_IMAGE = [{ mimeType: "image/jpeg", bytes: Buffer.from("x") }];

beforeEach(() => {
  mockGenerateText.mockReset();
});

describe("performReceiptOcr — detekce useknutého výstupu (ModelOutputTruncatedError)", () => {
  it("finishReason 'stop' (přirozené dokončení) → appka vrátí text normálně", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "=== VÝŘEZ 1 ===\nPivo 12° 1 ks 100,00 Kč",
      finishReason: "stop",
      usage: { inputTokens: 500, outputTokens: 120, totalTokens: 620 },
    });
    const { performReceiptOcr } = await import("../receiptOcrModel");
    const text = await performReceiptOcr(SOME_IMAGE, RECEIPT_ID);
    expect(text).toBe("=== VÝŘEZ 1 ===\nPivo 12° 1 ks 100,00 Kč");
  });

  it("finishReason 'length' (výstupní limit) → appka NEPŘIJME částečný text jako dokončené OCR, vyhodí ModelOutputTruncatedError(phase='ocr')", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "=== VÝŘEZ 1 ===\nPivo 12° 1 ks 100,00 Kč\n=== VÝŘEZ 2 ===\n(oříznuto uprostřed vě", // zjevně neúplné
      finishReason: "length",
      usage: { inputTokens: 500, outputTokens: 4096, totalTokens: 4596 },
    });
    const { performReceiptOcr } = await import("../receiptOcrModel");

    let caught: unknown;
    try {
      await performReceiptOcr(SOME_IMAGE, RECEIPT_ID);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ModelOutputTruncatedError);
    expect((caught as InstanceType<typeof ModelOutputTruncatedError>).phase).toBe("ocr");
  });

  it("jiné finishReason (např. 'content-filter') NENÍ považováno za useknutí limitem — appka vrátí text, jak ho model dal", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "částečně zablokovaný výstup",
      finishReason: "content-filter",
      usage: { inputTokens: 500, outputTokens: 10, totalTokens: 510 },
    });
    const { performReceiptOcr } = await import("../receiptOcrModel");
    const text = await performReceiptOcr(SOME_IMAGE, RECEIPT_ID);
    expect(text).toBe("částečně zablokovaný výstup");
  });

  it("loguje jen bezpečná metadata (receiptId, fáze, modelId, finishReason, počty tokenů) — NIKDY OCR text ani obrázek", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const secretOcrText = "Jan Novák, RČ 900101/1234 — tajný obsah účtenky";
    mockGenerateText.mockResolvedValueOnce({
      text: secretOcrText,
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
    const { performReceiptOcr } = await import("../receiptOcrModel");
    await performReceiptOcr(SOME_IMAGE, RECEIPT_ID);

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const loggedJson = JSON.stringify(consoleLogSpy.mock.calls);
    expect(loggedJson).toContain(RECEIPT_ID);
    expect(loggedJson).toContain("ocr");
    expect(loggedJson).toContain("stop");
    expect(loggedJson).toContain("10"); // inputTokens
    expect(loggedJson).toContain("20"); // outputTokens
    expect(loggedJson).not.toContain(secretOcrText);
    expect(loggedJson).not.toContain("Jan Novák");
    expect(loggedJson).not.toContain("RČ");

    consoleLogSpy.mockRestore();
  });

  it("i při useknutí (finishReason 'length') se diagnostika zaloguje PŘED vyhozením chyby — appka tedy vidí i tenhle případ v logu, ne jen tiché selhání", async () => {
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockGenerateText.mockResolvedValueOnce({
      text: "neúplný přepis",
      finishReason: "length",
      usage: { inputTokens: 500, outputTokens: 4096, totalTokens: 4596 },
    });
    const { performReceiptOcr } = await import("../receiptOcrModel");
    await expect(performReceiptOcr(SOME_IMAGE, RECEIPT_ID)).rejects.toThrow(ModelOutputTruncatedError);

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const loggedJson = JSON.stringify(consoleLogSpy.mock.calls);
    expect(loggedJson).toContain("length");
    expect(loggedJson).not.toContain("neúplný přepis");

    consoleLogSpy.mockRestore();
  });
});
