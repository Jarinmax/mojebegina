import { describe, expect, it } from "vitest";
import { createCatalogIndex } from "../catalogIndex";
import { resolveCartLines } from "../cart";
import { priceCart } from "../pricing";
import {
  SET_CAMPAIGN_SKU,
  SET_DEFAULT_CHOICE,
  SET_SKU,
  SET_SLUG,
  baseSku,
  campaignRemaining,
  choiceFromSku,
  choiceLabel,
  isCampaignSetSku,
  setCartSku,
  withChoice,
} from "../tastingSet";
import type { Catalog, Product } from "../types";
import { quoteZasilkovna } from "../zasilkovna";

const food = { ingredients: "x", allergens: [], nutritionPer100g: null, storage: null, shelfLife: null };
const base = { highlights: [], description: [], taste: null, warnings: [], image: null, gallery: [], alcoholPercent: null, isAgeRestricted: false, foodInfo: food };
const variant = (sku: string, priceKc: number, volumeMl: number, weightGrams: number) => ({ sku, label: null, detail: null, description: null, priceKc, volumeMl, servings: null, weightGrams });
const set = (sku: string, priceKc: number, remaining?: number): Product =>
  ({ ...base, slug: SET_SLUG, name: "Ochutnávkový set sirupů 5 × 100 ml", category: "sirupy", shortDescription: null, variants: [variant(sku, priceKc, 500, 900)], ...(remaining === undefined ? {} : { tastingCampaign: { remaining } }) }) as unknown as Product;
const pouch = { ...base, slug: "lipovy-sirup", name: "Lipový sirup", category: "sirupy", shortDescription: null, variants: [{ ...variant("lipovy-sirup-750ml", 199, 650, 805), label: "650 ml" }] } as unknown as Product;
const soup = { ...base, slug: "kulajda", name: "Kulajda", category: "polevky", shortDescription: null, variants: [{ ...variant("kulajda-3l", 379, 3000, 3000), label: "3 l" }] } as unknown as Product;
const categories = [{ slug: "sirupy", name: "Sirupy", image: null, intro: [], detailSections: [], ageRestricted: false }, { slug: "polevky", name: "Polévky", image: null, intro: [], detailSections: [], ageRestricted: false }];
const index = (products: Product[]) => createCatalogIndex({ categories, products } as Catalog);
const CHOICE = setCartSku(SET_CAMPAIGN_SKU, SET_DEFAULT_CHOICE)!;
const opts = { shippingMode: "weight" as const, zasilkovna: true };

describe("ochutnávkový set sirupů", () => {
  it("výběr pěti sirupů se nese v SKU řádku košíku", () => {
    expect(CHOICE).toBe("set-sirupy-5x100-k~sa.li.za.ib.si");
    expect(baseSku(CHOICE)).toBe(SET_CAMPAIGN_SKU);
    expect(choiceFromSku(CHOICE)).toEqual(["sa", "li", "za", "ib", "si"]);
    expect(setCartSku(SET_SKU, ["sa", "li"])).toBeNull();
    expect(choiceFromSku("set-sirupy-5x100~sa.li.za.ib.xx")).toBeNull();
    expect(choiceFromSku(SET_SKU)).toBeNull();
    expect(choiceLabel(["li", "li", "sa", "me", "li"])).toBe("3× Lipový, Šaman, Meduňkový s levandulí");
    expect(withChoice("Set", CHOICE)).toBe("Set (Šaman, Lipový, Zázvorový, Ibiškový, Šípkový)");
    expect(isCampaignSetSku(CHOICE)).toBe(true);
    expect(isCampaignSetSku("set-sirupy-5x100~sa.li.za.ib.si")).toBe(false);
    expect(campaignRemaining(0)).toBe(100);
    expect(campaignRemaining(97)).toBe(3);
    expect(campaignRemaining(140)).toBe(0);
  });

  it("katalog najde balení setu i s výběrem; neplatný výběr je neznámé balení", () => {
    const idx = index([set(SET_CAMPAIGN_SKU, 189, 100)]);
    expect(idx.getVariant(CHOICE)?.variant.sku).toBe(SET_CAMPAIGN_SKU);
    expect(idx.getVariant("set-sirupy-5x100-k~sa.li")).toBeUndefined();
    expect(idx.getVariant("lipovy-sirup-750ml~sa.li.za.ib.si")).toBeUndefined();
    const lines = resolveCartLines([{ sku: CHOICE, quantity: 2 }], idx);
    expect(lines[0].name).toBe("Ochutnávkový set sirupů 5 × 100 ml (Šaman, Lipový, Zázvorový, Ibiškový, Šípkový)");
    expect(lines[0].lineTotalKc).toBe(378);
  });

  it("úvodní cena: samotný set Zásilkovnou zdarma, do objednávky jde SKU bez výběru a výběr v názvu", () => {
    const priced = priceCart([{ sku: CHOICE, quantity: 1 }], "zasilkovna", index([set(SET_CAMPAIGN_SKU, 189, 100)]), opts);
    expect(priced.ok).toBe(true);
    if (!priced.ok) return;
    expect(priced.value.shippingKc).toBe(0);
    expect(priced.value.totalKc).toBe(189);
    expect(priced.value.lines[0]).toMatchObject({ sku: SET_CAMPAIGN_SKU, unitPriceKc: 189, name: "Ochutnávkový set sirupů 5 × 100 ml (Šaman, Lipový, Zázvorový, Ibiškový, Šípkový)" });
  });

  it("dva sety s různým výběrem jsou dva řádky; bez výběru set objednat nejde", () => {
    const idx = index([set(SET_CAMPAIGN_SKU, 189, 100)]);
    const other = setCartSku(SET_CAMPAIGN_SKU, ["he", "he", "he", "me", "me"])!;
    const two = priceCart([{ sku: CHOICE, quantity: 1 }, { sku: other, quantity: 1 }], "zasilkovna", idx, opts);
    expect(two.ok && two.value.lines.map((line) => line.name)).toEqual([
      "Ochutnávkový set sirupů 5 × 100 ml (Šaman, Lipový, Zázvorový, Ibiškový, Šípkový)",
      "Ochutnávkový set sirupů 5 × 100 ml (3× Heřmánkový, 2× Meduňkový s levandulí)",
    ]);
    const bare = priceCart([{ sku: SET_CAMPAIGN_SKU, quantity: 1 }], "zasilkovna", idx, opts);
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.error).toContain("vyberte prosím všech pět sirupů");
  });

  it("set + sáčky 650 ml = cena Zásilkovny za sáčky (104 Kč); běžná cena setu = 104 Kč", () => {
    const withPouch = priceCart([{ sku: CHOICE, quantity: 1 }, { sku: "lipovy-sirup-750ml", quantity: 4 }], "zasilkovna", index([set(SET_CAMPAIGN_SKU, 189, 100), pouch]), opts);
    expect(withPouch.ok && withPouch.value.shippingKc).toBe(104);
    const regular = setCartSku(SET_SKU, SET_DEFAULT_CHOICE)!;
    const full = priceCart([{ sku: regular, quantity: 1 }], "zasilkovna", index([set(SET_SKU, 249)]), opts);
    expect(full.ok && full.value.shippingKc).toBe(104);
    expect(full.ok && full.value.totalKc).toBe(353);
    // pět sáčků se do krabice nevejde ani se setem
    expect(quoteZasilkovna([{ quantity: 5, product: pouch, variant: pouch.variants[0] }, { quantity: 1, product: set(SET_CAMPAIGN_SKU, 189), variant: set(SET_CAMPAIGN_SKU, 189).variants[0] }])).toEqual({ available: false, reason: "too_many" });
  });

  it("s chlazeným zbožím se set přibalí a dopravu nezdraží; samotný set chlazenou přepravou nejde", () => {
    const idx = index([set(SET_CAMPAIGN_SKU, 189, 100), soup]);
    const alone = priceCart([{ sku: "kulajda-3l", quantity: 1 }], "rozvoz", idx, opts);
    const withSet = priceCart([{ sku: "kulajda-3l", quantity: 1 }, { sku: CHOICE, quantity: 1 }], "rozvoz", idx, opts);
    expect(alone.ok && withSet.ok && withSet.value.shippingKc === alone.value.shippingKc).toBe(true);
    expect(withSet.ok && withSet.value.subtotalKc).toBe(379 + 189);
    const onlySet = priceCart([{ sku: CHOICE, quantity: 1 }], "rozvoz", idx, opts);
    expect(onlySet.ok).toBe(false);
    const sk = priceCart([{ sku: CHOICE, quantity: 1 }], "rozvoz", idx, { ...opts, destination: "sk" });
    expect(sk.ok).toBe(false);
    const pickup = priceCart([{ sku: CHOICE, quantity: 1 }], "osobni-odber", idx, opts);
    expect(pickup.ok && pickup.value.totalKc).toBe(189);
  });

  it("za úvodní cenu nejde objednat víc setů, než kolik zbývá ze 100", () => {
    const over = priceCart([{ sku: CHOICE, quantity: 3 }], "zasilkovna", index([set(SET_CAMPAIGN_SKU, 189, 2)]), opts);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toContain("zbývá jen 2 ks");
    expect(priceCart([{ sku: CHOICE, quantity: 2 }], "zasilkovna", index([set(SET_CAMPAIGN_SKU, 189, 2)]), opts).ok).toBe(true);
  });
});
