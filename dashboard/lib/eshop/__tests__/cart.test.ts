import { describe, expect, it } from "vitest";
import {
  addToCart,
  setLineQuantity,
  cartItemCount,
  parseStoredCart,
  MAX_QUANTITY_PER_LINE,
} from "../cart";

describe("košík — E-shop 1.0", () => {
  it("přidání stejného produktu sčítá množství, nezakládá druhý řádek", () => {
    const cart = addToCart(addToCart([], "kulajda"), "kulajda", 2);
    expect(cart).toEqual([{ slug: "kulajda", quantity: 3 }]);
  });

  it("množství je shora omezené", () => {
    const cart = addToCart([], "kulajda", 500);
    expect(cart).toEqual([{ slug: "kulajda", quantity: MAX_QUANTITY_PER_LINE }]);
  });

  it("nastavení množství na 0 řádek odebere", () => {
    const cart = setLineQuantity([{ slug: "kulajda", quantity: 2 }], "kulajda", 0);
    expect(cart).toEqual([]);
  });

  it("počet kusů sčítá všechny řádky", () => {
    expect(
      cartItemCount([
        { slug: "kulajda", quantity: 2 },
        { slug: "dynova-polevka", quantity: 3 },
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

  it("zahodí neznámé produkty a neplatná množství, sloučí duplicity", () => {
    const raw = JSON.stringify([
      { slug: "kulajda", quantity: 1 },
      { slug: "neexistuje", quantity: 1 },
      { slug: "dynova-polevka", quantity: 0 },
      { slug: "dynova-polevka", quantity: 1.5 },
      { slug: "dynova-polevka", quantity: "2" },
      { slug: "kulajda", quantity: 2 },
      null,
    ]);
    expect(parseStoredCart(raw)).toEqual([{ slug: "kulajda", quantity: 3 }]);
  });
});
