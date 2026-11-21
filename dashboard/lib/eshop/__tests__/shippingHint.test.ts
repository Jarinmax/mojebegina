import { describe, expect, it } from "vitest";
import { cartShippingHint, productShippingNote } from "../shippingHint";

const soup = (quantity: number) => ({ sku: "dynova-3l", quantity, product: { category: "polevky", slug: "dynova-polevka" }, variant: { sku: "dynova-3l", volumeMl: 3000, weightGrams: 3000 } });
const opts = { weightMode: true, zasilkovna: true };
const nbsp = (s: string | null | undefined) => (s ?? "").replace(/\s/g, " ");

describe("doprava vidět dřív", () => {
  it("věta na produktu podle ceníku", () => {
    expect(nbsp(productShippingNote())).toBe("Chlazená doprava po celé ČR od 267 Kč (pod 15 kg, to jsou až 4 beginy 3 l). Osobní odběr ve Viticích zdarma.");
  });
  it("košík: cena a kolik se vejde za stejnou dopravu", () => {
    const hint = cartShippingHint([soup(3)], opts)!;
    expect(nbsp(hint.main)).toBe("Chlazená doprava pro váš košík: 267 Kč (9 kg).");
    expect(nbsp(hint.extra)).toBe("Pod 15 kg platíte pořád 267 Kč — vejde se ještě 1 begina 3 l. Osobní odběr ve Viticích zdarma.");
    const four = cartShippingHint([soup(4)], opts)!;
    expect(nbsp(four.main)).toBe("Chlazená doprava pro váš košík: 267 Kč (12 kg).");
    expect(nbsp(four.extra)).toBe("Osobní odběr ve Viticích zdarma.");
    const five = cartShippingHint([soup(5)], opts)!;
    expect(nbsp(five.main)).toBe("Chlazená doprava pro váš košík: 379 Kč (15 kg).");
    expect(nbsp(five.extra)).toContain("Pod 20 kg platíte pořád 379 Kč — vejde se ještě 1 begina 3 l");
  });
  it("sirupy jsou těžší (3 826 g i s krabicí)", () => {
    const syrup = (quantity: number) => ({ sku: "lipovy-sirup-3l", quantity, product: { category: "sirupy", slug: "lipovy-sirup" }, variant: { sku: "lipovy-sirup-3l", volumeMl: 3000, weightGrams: 3826 } });
    expect(nbsp(productShippingNote(3826))).toContain("(pod 15 kg, to jsou až 3 beginy 3 l)");
    const three = cartShippingHint([syrup(3)], opts)!;
    expect(nbsp(three.main)).toBe("Chlazená doprava pro váš košík: 267 Kč (11,5 kg).");
    expect(nbsp(three.extra)).toBe("Osobní odběr ve Viticích zdarma.");
    const four = cartShippingHint([syrup(4)], opts)!;
    expect(nbsp(four.main)).toBe("Chlazená doprava pro váš košík: 379 Kč (15,3 kg).");
    const mixed = cartShippingHint([syrup(1), soup(1)], opts)!;
    expect(nbsp(mixed.extra)).toContain("vejdou se ještě 2 beginy 3 l");
  });
  it("paušál, set nebo chybějící hmotnost → původní věta", () => {
    expect(cartShippingHint([soup(1)], { weightMode: false, zasilkovna: true })).toBeNull();
    expect(cartShippingHint([{ ...soup(1), variant: { ...soup(1).variant, weightGrams: null } }], opts)).toBeNull();
    expect(cartShippingHint([{ ...soup(1), product: { category: "sirupy", slug: "ochutnavkovy-set-sirupu" } }], opts)).toBeNull();
  });
});
