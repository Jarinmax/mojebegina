import { describe, expect, it } from "vitest";
import { priceCart } from "../pricing";
import { getProduct, products, isFoodInfoComplete } from "../catalog";

describe("priceCart — E-shop 1.0", () => {
  it("ceny bere z katalogu a dopočítá dopravu i součet", () => {
    const result = priceCart(
      [
        { slug: "kulajda", quantity: 2 },
        { slug: "dynova-polevka", quantity: 1 },
      ],
      "rozvoz"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines).toEqual([
        { slug: "kulajda", name: "Kulajda", quantity: 2, unitPriceKc: 379, lineTotalKc: 758 },
        {
          slug: "dynova-polevka",
          name: "Dýňová polévka",
          quantity: 1,
          unitPriceKc: 379,
          lineTotalKc: 379,
        },
      ]);
      expect(result.value.subtotalKc).toBe(1137);
      expect(result.value.shippingKc).toBe(99);
      expect(result.value.totalKc).toBe(1236);
    }
  });

  it("osobní odběr je zdarma", () => {
    const result = priceCart([{ slug: "kulajda", quantity: 1 }], "osobni-odber");
    expect(result.ok && result.value.totalKc).toBe(379);
  });

  it("prázdný košík = DENY", () => {
    expect(priceCart([], "rozvoz")).toEqual({ ok: false, error: "Košík je prázdný." });
  });

  it("neznámý způsob doručení = DENY", () => {
    expect(priceCart([{ slug: "kulajda", quantity: 1 }], "dron")).toEqual({
      ok: false,
      error: "Vyberte způsob doručení.",
    });
  });

  it("neznámý produkt, duplicita nebo neplatné množství = DENY", () => {
    expect(priceCart([{ slug: "neexistuje", quantity: 1 }], "rozvoz").ok).toBe(false);
    expect(
      priceCart(
        [
          { slug: "kulajda", quantity: 1 },
          { slug: "kulajda", quantity: 1 },
        ],
        "rozvoz"
      ).ok
    ).toBe(false);
    expect(priceCart([{ slug: "kulajda", quantity: 0 }], "rozvoz").ok).toBe(false);
    expect(priceCart([{ slug: "kulajda", quantity: 1.5 }], "rozvoz").ok).toBe(false);
    expect(priceCart([{ slug: "kulajda", quantity: 100 }], "rozvoz").ok).toBe(false);
  });
});

describe("katalog", () => {
  it("slugy jsou unikátní a dohledatelné", () => {
    const slugs = products.map((product) => product.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(getProduct(slug)?.slug).toBe(slug);
    }
  });

  it("produkt bez povinných údajů o potravině není připravený na ostrý prodej", () => {
    const product = products[0];
    expect(isFoodInfoComplete(product)).toBe(false);
    expect(
      isFoodInfoComplete({
        ...product,
        packageLabel: "0,5 l",
        foodInfo: {
          ingredients: "voda, dýně",
          allergens: [],
          nutritionPer100g: "…",
          storage: "0–4 °C",
          shelfLife: "7 dní",
        },
      })
    ).toBe(true);
  });
});
