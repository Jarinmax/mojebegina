// @vitest-environment node
//
// Mobilní tok 1.0 — "use server" hranice volané přímo jako funkce (ne přes
// <form action>), aby se dalo po úspěchu rovnou aktualizovat UI bez
// redirectu/reloadu. Testuje se JEN překlad chyb na českou hlášku
// (requireReviewAccess/requireUploadAccess uvnitř lib/data/sklad.ts a
// lib/data/skladExtraction.ts jsou zmockované pryč — to už testují
// lib/data/__tests__/skladSupplier.test.ts/skladExtraction.test.ts/
// skladAuth.test.ts) a že neznámá chyba se nepolyká.
import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

const mockCreateSupplier = vi.fn();
vi.mock("@/lib/data/sklad", () => ({
  createDraftGoodsReceipt: vi.fn(),
  createStockItem: vi.fn(),
  createSupplier: (...args: unknown[]) => mockCreateSupplier(...args),
  reviewGoodsReceiptLineVat: vi.fn(),
  updateGoodsReceiptLine: vi.fn(),
}));

const mockTriggerExtraction = vi.fn();
const mockConfirmMapping = vi.fn();
vi.mock("@/lib/data/skladExtraction", () => ({
  confirmGoodsReceiptLineMapping: (...args: unknown[]) => mockConfirmMapping(...args),
  triggerGoodsReceiptExtraction: (...args: unknown[]) => mockTriggerExtraction(...args),
}));

describe("createSupplierForReceiptAction — překlad chyb oprávnění (bod „+ Založit dodavatele“)", () => {
  it("UnauthenticatedError → česká hláška, ne nezachycená výjimka", async () => {
    mockCreateSupplier.mockRejectedValueOnce(new UnauthenticatedError());
    const { createSupplierForReceiptAction } = await import("../actions");
    const result = await createSupplierForReceiptAction({ name: "Test", ico: "", dic: "" });
    expect(result).toEqual({ ok: false, error: "Nepřihlášeno." });
  });

  it("ForbiddenError (např. Jiří Střelec, bez requireReviewAccess) → česká hláška", async () => {
    mockCreateSupplier.mockRejectedValueOnce(new ForbiddenError());
    const { createSupplierForReceiptAction } = await import("../actions");
    const result = await createSupplierForReceiptAction({ name: "Test", ico: "", dic: "" });
    expect(result).toEqual({ ok: false, error: "Nemáte oprávnění založit dodavatele." });
  });

  it("jiná (neznámá) chyba se znovu vyhodí, nepolyká se", async () => {
    mockCreateSupplier.mockRejectedValueOnce(new Error("connection reset"));
    const { createSupplierForReceiptAction } = await import("../actions");
    await expect(createSupplierForReceiptAction({ name: "Test", ico: "", dic: "" })).rejects.toThrow("connection reset");
  });

  it("úspěch i validační/duplicitní {ok:false} z createSupplier projdou beze změny (passthrough)", async () => {
    mockCreateSupplier.mockResolvedValueOnce({ ok: true, supplierId: "s-1" });
    const { createSupplierForReceiptAction } = await import("../actions");
    const okResult = await createSupplierForReceiptAction({ name: "Test", ico: "", dic: "" });
    expect(okResult).toEqual({ ok: true, supplierId: "s-1" });

    mockCreateSupplier.mockResolvedValueOnce({ ok: false, error: "Dodavatel s tímto IČO už existuje." });
    const dupResult = await createSupplierForReceiptAction({ name: "Test", ico: "74337297", dic: "" });
    expect(dupResult).toEqual({ ok: false, error: "Dodavatel s tímto IČO už existuje." });
  });
});

describe("triggerGoodsReceiptExtractionAction / confirmGoodsReceiptLineMappingAction — AI vytěžení (mobilní tok)", () => {
  it("triggerGoodsReceiptExtractionAction: ForbiddenError → česká hláška", async () => {
    mockTriggerExtraction.mockRejectedValueOnce(new ForbiddenError());
    const { triggerGoodsReceiptExtractionAction } = await import("../actions");
    const result = await triggerGoodsReceiptExtractionAction("r1");
    expect(result).toEqual({ ok: false, error: "Nemáte oprávnění vytěžit doklad této příjemky." });
  });

  it("triggerGoodsReceiptExtractionAction: úspěch/chyba z triggerGoodsReceiptExtraction projde beze změny", async () => {
    mockTriggerExtraction.mockResolvedValueOnce({ ok: true });
    const { triggerGoodsReceiptExtractionAction } = await import("../actions");
    expect(await triggerGoodsReceiptExtractionAction("r1")).toEqual({ ok: true });

    mockTriggerExtraction.mockResolvedValueOnce({ ok: false, error: "Nejdřív nahrajte aspoň jednu fotku dokladu." });
    expect(await triggerGoodsReceiptExtractionAction("r1")).toEqual({
      ok: false,
      error: "Nejdřív nahrajte aspoň jednu fotku dokladu.",
    });
  });

  it("confirmGoodsReceiptLineMappingAction: UnauthenticatedError → česká hláška", async () => {
    mockConfirmMapping.mockRejectedValueOnce(new UnauthenticatedError());
    const { confirmGoodsReceiptLineMappingAction } = await import("../actions");
    const result = await confirmGoodsReceiptLineMappingAction("r1", "line-1", {
      stockItemId: "item-1",
      lineKind: "resale_goods",
      rememberMapping: true,
    });
    expect(result).toEqual({ ok: false, error: "Nepřihlášeno." });
  });

  it("confirmGoodsReceiptLineMappingAction: neznámá chyba se znovu vyhodí, nepolyká se", async () => {
    mockConfirmMapping.mockRejectedValueOnce(new Error("connection reset"));
    const { confirmGoodsReceiptLineMappingAction } = await import("../actions");
    await expect(
      confirmGoodsReceiptLineMappingAction("r1", "line-1", { stockItemId: null, lineKind: "non_stock_private", rememberMapping: false })
    ).rejects.toThrow("connection reset");
  });
});
