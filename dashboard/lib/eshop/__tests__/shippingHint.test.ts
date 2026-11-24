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
    expect(nbsp(hint.main)).toBe("Chlazená doprava pro váš košík: 267 Kč.");
    expect(nbsp(hint.extra)).toBe("Pod 15 kg platíte pořád 267 Kč — vejde se ještě 1 begina 3 l. Osobní odběr ve Viticích zdarma.");
    const four = cartShippingHint([soup(4)], opts)!;
    expect(nbsp(four.main)).toBe("Chlazená doprava pro váš košík: 267 Kč.");
    expect(nbsp(four.extra)).toBe("Osobní odběr ve Viticích zdarma.");
    const five = cartShippingHint([soup(5)], opts)!;
    expect(nbsp(five.main)).toBe("Chlazená doprava pro váš košík: 379 Kč.");
    expect(nbsp(five.extra)).toContain("Pod 20 kg platíte pořád 379 Kč — vejde se ještě 1 begina 3 l");
  });
  it("sirupy jsou těžší (3 826 g i s krabicí)", () => {
    const syrup = (quantity: number) => ({ sku: "lipovy-sirup-3l", quantity, product: { category: "sirupy", slug: "lipovy-sirup" }, variant: { sku: "lipovy-sirup-3l", volumeMl: 3000, weightGrams: 3826 } });
    expect(nbsp(productShippingNote(3826))).toContain("(pod 15 kg, to jsou až 3 beginy 3 l)");
    const three = cartShippingHint([syrup(3)], opts)!;
    expect(nbsp(three.main)).toBe("Chlazená doprava pro váš košík: 267 Kč.");
    expect(nbsp(three.extra)).toBe("Osobní odběr ve Viticích zdarma.");
    const four = cartShippingHint([syrup(4)], opts)!;
    expect(nbsp(four.main)).toBe("Chlazená doprava pro váš košík: 379 Kč.");
    const mixed = cartShippingHint([syrup(1), soup(1)], opts)!;
    expect(nbsp(mixed.extra)).toContain("vejdou se ještě 2 beginy 3 l");
  });
  it("paušál, set nebo chybějící hmotnost → původní věta", () => {
    expect(cartShippingHint([soup(1)], { weightMode: false, zasilkovna: true })).toBeNull();
    expect(cartShippingHint([{ ...soup(1), variant: { ...soup(1).variant, weightGrams: null } }], opts)).toBeNull();
    expect(cartShippingHint([{ ...soup(1), product: { category: "sirupy", slug: "ochutnavkovy-set-sirupu" } }], opts)).toBeNull();
  });
  it("polévka 2 950 g: hláška = pokladna (24. 11. 2026)", () => {
    const real = (quantity: number) => ({ ...soup(quantity), variant: { ...soup(quantity).variant, weightGrams: 2950 } });
    const one = cartShippingHint([real(1)], opts)!;
    expect(nbsp(one.main)).toBe("Chlazená doprava pro váš košík: 267 Kč.");
    expect(nbsp(one.extra)).toContain("vejdou se ještě 4 beginy 3 l");
    const four = cartShippingHint([real(4)], opts)!;
    expect(nbsp(four.main)).toBe("Chlazená doprava pro váš košík: 267 Kč.");
    expect(nbsp(four.extra)).toContain("vejde se ještě 1 begina 3 l");
    const five = cartShippingHint([real(5)], opts)!;
    expect(nbsp(five.main)).toBe("Chlazená doprava pro váš košík: 267 Kč.");
    expect(nbsp(five.extra)).toBe("Osobní odběr ve Viticích zdarma.");
    const six = cartShippingHint([real(6)], opts)!;
    expect(nbsp(six.main)).toBe("Chlazená doprava pro váš košík: 379 Kč.");
    // zpět na čtyři: zase 267 Kč a 1 další
    expect(nbsp(cartShippingHint([real(4)], opts)!.extra)).toContain("ještě 1 begina");
  });
  it("slib „vejde se ještě N“ nikdy nepřekročí pásmo (různě těžké položky)", () => {
    const syrup = (quantity: number) => ({ sku: "lipovy-sirup-3l", quantity, product: { category: "sirupy", slug: "lipovy-sirup" }, variant: { sku: "lipovy-sirup-3l", volumeMl: 3000, weightGrams: 3826 } });
    const pack = (quantity: number) => ({ sku: "polevky-3x450~dy.ku.to", quantity, product: { category: "polevky", slug: "ochutnavka-polevek-3x450" }, variant: { sku: "polevky-3x450", volumeMl: 1350, weightGrams: 1500 } });
    const real = (quantity: number) => ({ ...soup(quantity), variant: { ...soup(quantity).variant, weightGrams: 2950 } });
    const carts = [[real(1)], [real(2), syrup(1)], [pack(1)], [pack(2), real(1)], [syrup(2), pack(1)]];
    for (const cart of carts) {
      const hint = cartShippingHint(cart, opts)!;
      const fits = Number(/ještě (\d+)/.exec(hint.extra ?? "")?.[1] ?? 0);
      const price = /: (\d+)\s*Kč/.exec(nbsp(hint.main))![1];
      const heavy = Math.max(3826 * (cart.some((l) => l.variant.volumeMl! < 2900 && !cart.some((m) => m.variant.volumeMl! >= 2900)) ? 1 : 0), ...cart.filter((l) => l.variant.volumeMl! >= 2900).map((l) => l.variant.weightGrams!));
      const more = cartShippingHint([...cart, { ...syrup(fits), variant: { ...syrup(fits).variant, weightGrams: heavy } }], opts)!;
      if (fits > 0) expect(/: (\d+)\s*Kč/.exec(nbsp(more.main))![1]).toBe(price);
    }
  });
});
