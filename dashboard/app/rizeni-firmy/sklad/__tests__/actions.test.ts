// @vitest-environment node
//
// Mobilní tok 1.0 — createSupplierForReceiptAction je nová "use server"
// hranice volaná přímo z NovaPrijemkaForm (ne přes <form action>), aby
// formulář mohl po úspěchu nového dodavatele rovnou vybrat bez reloadu.
// Testuje se JEN překlad chyb na českou hlášku (requireReviewAccess uvnitř
// createSupplier je zmockovaná pryč — to už testuje
// lib/data/__tests__/skladSupplier.test.ts/skladAuth.test.ts) a že
// neznámá chyba se nepolyká.
import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

const mockCreateSupplier = vi.fn();
vi.mock("@/lib/data/sklad", () => ({
  createDraftGoodsReceipt: vi.fn(),
  createSupplier: (...args: unknown[]) => mockCreateSupplier(...args),
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
