import { describe, expect, it } from "vitest";
import { priceCart } from "../pricing";
import { existsSync } from "node:fs";
import path from "node:path";
import { categories, getProduct, getVariant, products, isFoodInfoComplete } from "../catalog";

describe("priceCart — E-shop 1.0", () => {
  it("ceny bere z katalogu a dopočítá dopravu i součet", () => {
    const result = priceCart(
      [
        { sku: "kulajda", quantity: 2 },
        { sku: "dynova-polevka", quantity: 1 },
      ],
      "rozvoz"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines).toEqual([
        { sku: "kulajda", name: "Kulajda", quantity: 2, unitPriceKc: 379, lineTotalKc: 758 },
        {
          sku: "dynova-polevka",
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

  it("koktejl se účtuje podle zvoleného balení a označí košík jako 18+", () => {
    const result = priceCart(
      [
        { sku: "svarak-deluxe-3l", quantity: 1 },
        { sku: "svarak-deluxe-500ml", quantity: 2 },
      ],
      "osobni-odber"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lines.map((line) => [line.name, line.lineTotalKc])).toEqual([
        ["Svařák Deluxe — 3 l Rodinná zásoba (bag-in-box)", 499],
        ["Svařák Deluxe — 500 ml Praktické balení", 258],
      ]);
      expect(result.value.totalKc).toBe(757);
      expect(result.value.containsAgeRestricted).toBe(true);
    }
  });

  it("košík jen s polévkami není 18+", () => {
    const result = priceCart([{ sku: "kulajda", quantity: 1 }], "osobni-odber");
    expect(result.ok && result.value.containsAgeRestricted).toBe(false);
  });

  it("osobní odběr je zdarma", () => {
    const result = priceCart([{ sku: "kulajda", quantity: 1 }], "osobni-odber");
    expect(result.ok && result.value.totalKc).toBe(379);
  });

  it("prázdný košík = DENY", () => {
    expect(priceCart([], "rozvoz")).toEqual({ ok: false, error: "Košík je prázdný." });
  });

  it("neznámý způsob doručení = DENY", () => {
    expect(priceCart([{ sku: "kulajda", quantity: 1 }], "dron")).toEqual({
      ok: false,
      error: "Vyberte způsob doručení.",
    });
  });

  it("neznámý produkt, duplicita nebo neplatné množství = DENY", () => {
    expect(priceCart([{ sku: "neexistuje", quantity: 1 }], "rozvoz").ok).toBe(false);
    expect(
      priceCart(
        [
          { sku: "kulajda", quantity: 1 },
          { sku: "kulajda", quantity: 1 },
        ],
        "rozvoz"
      ).ok
    ).toBe(false);
    expect(priceCart([{ sku: "kulajda", quantity: 0 }], "rozvoz").ok).toBe(false);
    expect(priceCart([{ sku: "kulajda", quantity: 1.5 }], "rozvoz").ok).toBe(false);
    expect(priceCart([{ sku: "kulajda", quantity: 100 }], "rozvoz").ok).toBe(false);
  });
});

describe("katalog", () => {
  it("slugy i sku jsou unikátní a dohledatelné", () => {
    const slugs = products.map((product) => product.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(getProduct(slug)?.slug).toBe(slug);
    }
    const skus = products.flatMap((product) => product.variants.map((variant) => variant.sku));
    expect(new Set(skus).size).toBe(skus.length);
    for (const sku of skus) {
      expect(getVariant(sku)?.variant.sku).toBe(sku);
    }
  });

  it("fotky kategorií a produktů existují v /public", () => {
    const images = [
      ...categories.map((category) => category.image),
      ...products.flatMap((product) => (product.image ? [product.image] : [])),
    ];
    for (const image of images) {
      expect(existsSync(path.join(__dirname, "../../../public", image)), image).toBe(true);
    }
  });

  it("každý produkt má aspoň jedno balení", () => {
    for (const product of products) {
      expect(product.variants.length).toBeGreaterThan(0);
    }
  });

  it("produkt bez povinných údajů o potravině není připravený na ostrý prodej", () => {
    const product = products[0];
    expect(isFoodInfoComplete(product)).toBe(false);
    expect(
      isFoodInfoComplete({
        ...product,
        variants: [{ ...product.variants[0], label: "0,5 l" }],
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

  it("alkoholický produkt bez obsahu alkoholu není připravený", () => {
    const svarak = getProduct("svarak-deluxe")!;
    const complete = {
      ...svarak,
      foodInfo: { ...svarak.foodInfo, allergens: ["siřičitany"], nutritionPer100g: "…", shelfLife: "…" },
    };
    expect(isFoodInfoComplete(complete)).toBe(true);
    expect(isFoodInfoComplete({ ...complete, alcoholPercent: null })).toBe(false);
  });
});
