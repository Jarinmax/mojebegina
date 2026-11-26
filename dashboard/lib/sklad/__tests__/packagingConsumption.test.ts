import { describe, expect, it } from "vitest";
import { PACKAGING, packagingForItem, packagingForOrder } from "../packagingConsumption";

describe("odečet obalů při expedici (Lucie 26. 11. 2026)", () => {
  it("3 l = bag + krabice, ochutnávky = kapsička 250 ml, sirupy 500/650", () => {
    expect(packagingForItem({ categorySlug: "polevky", volumeMl: 3000, sku: "dynova-polevka" })).toEqual([
      { name: PACKAGING.bag3l, quantity: 1 },
      { name: PACKAGING.box3l, quantity: 1 },
    ]);
    expect(packagingForItem({ categorySlug: "ochutnavka-provoz", volumeMl: 200, sku: "ochutnavka-polevka-tomatova" })).toEqual([{ name: PACKAGING.pouch250, quantity: 1 }]);
    expect(packagingForItem({ categorySlug: "sirupy", volumeMl: 500, sku: "x" })).toEqual([{ name: PACKAGING.syrup500, quantity: 1 }]);
    expect(packagingForItem({ categorySlug: "sirupy", volumeMl: 650, sku: "x" })).toEqual([{ name: PACKAGING.syrup650, quantity: 1 }]);
    expect(packagingForItem({ categorySlug: "polevky", volumeMl: 1350, sku: "polevky-3x450" })).toEqual([]);
  });
  it("objednávka 70000027: 2 × 3 l polévka + 4 ochutnávky", () => {
    const needs = packagingForOrder([
      { categorySlug: "polevky", volumeMl: 3000, sku: "spenatova", quantity: 1 },
      { categorySlug: "polevky", volumeMl: 3000, sku: "dynova", quantity: 1 },
      { categorySlug: "ochutnavka-provoz", volumeMl: 200, sku: "ochutnavka-polevka-a", quantity: 1 },
      { categorySlug: "ochutnavka-provoz", volumeMl: 200, sku: "ochutnavka-polevka-b", quantity: 1 },
      { categorySlug: "ochutnavka-provoz", volumeMl: 100, sku: "ochutnavka-sirup-c", quantity: 1 },
      { categorySlug: "ochutnavka-provoz", volumeMl: 100, sku: "ochutnavka-sirup-d", quantity: 1 },
    ]);
    expect(needs).toEqual([
      { name: PACKAGING.bag3l, quantity: 2 },
      { name: PACKAGING.box3l, quantity: 2 },
      { name: PACKAGING.pouch250, quantity: 4 },
    ]);
  });
});
