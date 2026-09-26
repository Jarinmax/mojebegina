import { describe, expect, it } from "vitest";
import {
  addToCart,
  setLineQuantity,
  cartItemCount,
  parseStoredCart,
  resolveCartLines,
  MAX_QUANTITY_PER_LINE,
} from "../cart";
import { catalogIndex } from "./helpers/catalogFixture";

describe("košík — E-shop 1.0", () => {
  it("přidání stejného produktu sčítá množství, nezakládá druhý řádek", () => {
    const cart = addToCart(addToCart([], "kulajda"), "kulajda", 2);
    expect(cart).toEqual([{ sku: "kulajda", quantity: 3 }]);
  });

  it("množství je shora omezené", () => {
    const cart = addToCart([], "kulajda", 500);
    expect(cart).toEqual([{ sku: "kulajda", quantity: MAX_QUANTITY_PER_LINE }]);
  });

  it("nastavení množství na 0 řádek odebere", () => {
    const cart = setLineQuantity([{ sku: "kulajda", quantity: 2 }], "kulajda", 0);
    expect(cart).toEqual([]);
  });

  it("počet kusů sčítá všechny řádky", () => {
    expect(
      cartItemCount([
        { sku: "kulajda", quantity: 2 },
        { sku: "dynova-polevka", quantity: 3 },
      ])
    ).toBe(5);
  });
});

describe("parseStoredCart — nedůvěryhodný obsah localStorage", () => {
  it("prázdný nebo rozbitý vstup = prázdný košík", () => {
    expect(parseStoredCart(null)).toEqual([]);
    expect(parseStoredCart("{nejde o json")).toEqual([]);
    expect(parseStoredCart('{"slug":"kulajda"}')).toEqual([]);
  });

  it("starý formát košíku (slug místo sku) se zahodí", () => {
    expect(parseStoredCart(JSON.stringify([{ slug: "kulajda", quantity: 1 }]))).toEqual([]);
  });

  it("zahodí neplatná množství a sloučí duplicity (katalog nezná — to řeší resolve)", () => {
    const raw = JSON.stringify([
      { sku: "kulajda", quantity: 1 },
      { sku: "neexistuje", quantity: 1 },
      { sku: "dynova-polevka", quantity: 0 },
      { sku: "dynova-polevka", quantity: 1.5 },
      { sku: "dynova-polevka", quantity: "2" },
      { sku: "", quantity: 1 },
      { sku: "kulajda", quantity: 2 },
      null,
    ]);
    expect(parseStoredCart(raw)).toEqual([
      { sku: "kulajda", quantity: 3 },
      { sku: "neexistuje", quantity: 1 },
    ]);
  });
});

describe("resolveCartLines — dohledání v katalogu z DB", () => {
  it("balení, které v katalogu není, se vynechá; cena a název z katalogu", () => {
    const lines = resolveCartLines(
      [
        { sku: "svarak-deluxe-500ml", quantity: 2 },
        { sku: "neexistuje", quantity: 1 },
      ],
      catalogIndex
    );
    expect(lines.map((line) => [line.sku, line.name, line.lineTotalKc])).toEqual([
      ["svarak-deluxe-500ml", "Svařák Deluxe — 500 ml Praktické balení", 258],
    ]);
  });
});
