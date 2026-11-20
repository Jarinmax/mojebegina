// Ochutnávka do provozu (20. 11. 2026): položky a názvy, nejvýš 1 kus, jen na firmu
// s IČO, bez Zásilkovny, součet, ARES, volitelná sleva vypnutá.
import { describe, expect, it } from "vitest";
import {
  CAFE_TASTING_CREDIT_ENABLED,
  CAFE_TASTING_ITEMS,
  CAFE_TASTING_LAUNCHED,
  CAFE_TASTING_NEED_COMPANY,
  CAFE_TASTING_ONE_EACH,
  CAFE_TASTING_SLUG,
  cafeTastingCredit,
  cafeTastingTotalKc,
  isCafeTastingSku,
  parseCafeTastingCompany,
} from "../cafeTasting";
import { aresStreet, aresZip, lookupAres, parseAresCompany } from "../ares";
import { addToCart, setLineQuantity } from "../cart";
import { createCatalogIndex } from "../catalogIndex";
import { priceCart } from "../pricing";
import { validateCheckoutInput } from "../checkout";
import { catalogIndex } from "./helpers/catalogFixture";
import type { Product } from "../types";

const base = catalogIndex.getProduct("kulajda")!;
const tasting: Product = {
  ...base,
  slug: CAFE_TASTING_SLUG,
  name: "Ochutnávka do provozu",
  category: "ochutnavka-provoz",
  variants: CAFE_TASTING_ITEMS.map((item) => ({ ...base.variants[0], sku: item.sku, label: `${item.name} ${item.volumeMl} ml`, priceKc: 49, volumeMl: item.volumeMl, servings: null, weightGrams: item.weightGrams })),
};
const index = createCatalogIndex({ ...catalogIndex.catalog, products: [...catalogIndex.catalog.products, tasting] });
const soup = CAFE_TASTING_ITEMS[0].sku;
const syrup = CAFE_TASTING_ITEMS[6].sku;

describe("Ochutnávka do provozu", () => {
  it("6 polévek a 7 sirupů s přesnými názvy z e-shopu, hmotnosti 250 a 140 g", () => {
    expect(CAFE_TASTING_ITEMS.filter((i) => i.kind === "polevka").map((i) => i.name)).toEqual([
      "Dýňová polévka", "Kulajda", "Tomatová polévka", "Rajčatová polévka s červenou řepou", "Gulášová polévka z hlívy ústřičné", "Špenátová polévka",
    ]);
    expect(CAFE_TASTING_ITEMS.filter((i) => i.kind === "sirup").map((i) => i.name)).toEqual([
      "Bylinný sirup Šaman", "Lipový sirup", "Zázvorový sirup", "Ibiškový sirup", "Šípkový sirup", "Heřmánkový sirup", "Meduňkový sirup s levandulí",
    ]);
    expect(CAFE_TASTING_ITEMS.every((i) => (i.kind === "sirup" ? i.weightGrams === 140 && i.volumeMl === 100 : i.weightGrams === 250 && i.volumeMl === 200))).toBe(true);
    expect(CAFE_TASTING_ITEMS.filter((i) => i.kind === "svarak").map((i) => [i.name, i.volumeMl, i.weightGrams])).toEqual([["Svařák Deluxe", 200, 250]]);
    expect(isCafeTastingSku("set-sirupy-5x100")).toBe(false);
  });

  it("zatím nespuštěno, volitelná sleva vypnutá", () => {
    expect(CAFE_TASTING_LAUNCHED).toBe(false);
    expect(CAFE_TASTING_CREDIT_ENABLED).toBe(false);
    expect(cafeTastingCredit({ ico: "12345678", tastingGoodsKc: 98, deliveredAt: new Date() })).toBeNull();
  });

  it("součet 49 Kč za kus, duplicity se nepočítají", () => {
    expect(cafeTastingTotalKc([soup, syrup, soup])).toBe(98);
    expect(cafeTastingTotalKc([])).toBe(0);
  });

  it("košík: z každé položky nejvýš 1 kus", () => {
    let cart = addToCart([], soup, 3);
    expect(cart).toEqual([{ sku: soup, quantity: 1 }]);
    cart = addToCart(cart, soup, 1);
    expect(cart[0].quantity).toBe(1);
    expect(setLineQuantity(cart, soup, 5)[0].quantity).toBe(1);
  });

  it("cena: 2 kusy téže položky ani Zásilkovna neprojdou; chlazeně a osobně ano", () => {
    expect(priceCart([{ sku: soup, quantity: 2 }], "rozvoz", index)).toEqual({ ok: false, error: CAFE_TASTING_ONE_EACH });
    const cold = priceCart([{ sku: soup, quantity: 1 }, { sku: syrup, quantity: 1 }], "rozvoz", index, { shippingMode: "weight" });
    expect(cold.ok).toBe(true);
    if (cold.ok) {
      expect(cold.value.subtotalKc).toBe(98);
      expect(cold.value.weightGrams).toBe(390);
    }
    expect(priceCart([{ sku: syrup, quantity: 1 }], "osobni-odber", index).ok).toBe(true);
    expect(priceCart([{ sku: syrup, quantity: 1 }], "zasilkovna", index, { zasilkovna: true }).ok).toBe(false);
  });

  it("Svařák Deluxe v ochutnávce vyžaduje potvrzení věku 18+", () => {
    const mulled = CAFE_TASTING_ITEMS.find((i) => i.kind === "svarak")!.sku;
    const priced = priceCart([{ sku: mulled, quantity: 1 }], "osobni-odber", index);
    expect(priced.ok && priced.value.containsAgeRestricted).toBe(true);
    const soupOnly = priceCart([{ sku: soup, quantity: 1 }], "osobni-odber", index);
    expect(soupOnly.ok && soupOnly.value.containsAgeRestricted).toBe(false);
  });

  it("pokladna: bez nákupu na firmu s IČO nejde objednat", () => {
    const input = {
      cart: JSON.stringify([{ sku: soup, quantity: 1 }]),
      name: "Jana Nováková", email: "jana@example.cz", phone: "+420 777 123 456",
      shippingMethodId: "osobni-odber", paymentMethodId: "prevod",
      billingStreet: "Hlavní 1", billingCity: "Kolín", billingZip: "280 02", billingCountry: "Česká republika",
      companyPurchase: false, billingCompany: "", billingIco: "", billingDic: "",
      deliverySameAsBilling: true, recipientName: "", recipientCompany: "", street: "", city: "", zip: "", recipientPhone: "",
      note: "", termsAccepted: true, ageConfirmed: false,
    };
    expect(validateCheckoutInput(input, index)).toEqual({ ok: false, error: CAFE_TASTING_NEED_COMPANY });
    const ok = validateCheckoutInput({ ...input, companyPurchase: true, billingCompany: "Kavárna s.r.o.", billingIco: "74337297" }, index);
    expect(ok.ok).toBe(true);
  });

  it("údaje firmy ze sessionStorage: jen s platným IČO", () => {
    expect(parseCafeTastingCompany(JSON.stringify({ venue: "U Lípy", company: "Lípa s.r.o.", ico: "74337297" }))?.ico).toBe("74337297");
    expect(parseCafeTastingCompany(JSON.stringify({ ico: "123" }))).toBeNull();
    expect(parseCafeTastingCompany("nesmysl")).toBeNull();
  });
});

describe("ARES", () => {
  it("adresa a PSČ jako na faktuře", () => {
    expect(aresStreet({ nazevUlice: "Mostecká", cisloDomovni: 273, cisloOrientacni: 21 })).toBe("Mostecká 273/21");
    expect(aresStreet({ nazevObce: "Vitice", cisloDomovni: 119 })).toBe("Vitice 119");
    expect(aresZip(11800)).toBe("118 00");
    expect(parseAresCompany({ obchodniJmeno: "Jaroslav Viner", sidlo: { nazevUlice: "Mostecká", cisloDomovni: 273, cisloOrientacni: 21, nazevObce: "Praha", psc: 11800 } }, "74337297")).toEqual({
      ico: "74337297", name: "Jaroslav Viner", dic: null, street: "Mostecká 273/21", city: "Praha", zip: "118 00",
    });
  });

  it("nenalezeno vs. nedostupné", async () => {
    const notFound = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    const down = (async () => { throw new Error("síť"); }) as unknown as typeof fetch;
    expect(await lookupAres("74337297", notFound)).toEqual({ ok: false, reason: "not_found" });
    expect(await lookupAres("74337297", down)).toEqual({ ok: false, reason: "unavailable" });
  });
});
