import { describe, expect, it } from "vitest";
import { stockRequestInputSchema } from "../productionCardValidation";

describe("karta výroby — žádost o doplnění suroviny", () => {
  it("přijme žádost na konkrétní skladovou kartu i bez ní (jen poznámka)", () => {
    expect(stockRequestInputSchema.safeParse({
      stockItemId: "70657472-2d76-4000-8000-000000000101",
      note: "Dojde cibule, do pátku potřeba 10 kg.",
    }).success).toBe(true);
    expect(stockRequestInputSchema.safeParse({
      note: "Nová surovina, zatím ve skladu není — skořicová kůra.",
    }).success).toBe(true);
  });

  it("odmítne prázdnou poznámku, moc dlouhou poznámku a neplatné ID skladové karty", () => {
    expect(stockRequestInputSchema.safeParse({ note: "" }).success).toBe(false);
    expect(stockRequestInputSchema.safeParse({ note: "x".repeat(501) }).success).toBe(false);
    expect(stockRequestInputSchema.safeParse({ stockItemId: "not-a-uuid", note: "Doplnit" }).success).toBe(false);
  });

  it("poznámku ořízne o okrajové mezery", () => {
    const parsed = stockRequestInputSchema.safeParse({ note: "  Doplnit med  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.note).toBe("Doplnit med");
  });
});
