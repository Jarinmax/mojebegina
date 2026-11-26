import { describe, expect, it } from "vitest";
import { PACKAGING, packagingForItem, packagingForOrder } from "../packagingConsumption";

// 2 etikety na balení, obě z černobílé role DK-22212 (Lucie 26. 11. 2026)
const L = (n: number) => [{ name: PACKAGING.labels, quantity: 2 * n }];

describe("odečet obalů podle objednávek (Lucie 26. 11. 2026)", () => {
  it("3 l, ochutnávky, sirupy 500/650, Ochutnávka polévek 3 × 450 ml — s 2 etiketami na balení", () => {
    expect(packagingForItem({ categorySlug: "polevky", volumeMl: 3000, sku: "dynova-polevka" })).toEqual([
      { name: PACKAGING.bag3l, quantity: 1 },
      { name: PACKAGING.box3l, quantity: 1 },
      ...L(1),
    ]);
    expect(packagingForItem({ categorySlug: "ochutnavka-provoz", volumeMl: 200, sku: "ochutnavka-polevka-tomatova" })).toEqual([{ name: PACKAGING.pouch250, quantity: 1 }, ...L(1)]);
    expect(packagingForItem({ categorySlug: "sirupy", volumeMl: 500, sku: "x" })).toEqual([{ name: PACKAGING.syrup500, quantity: 1 }, ...L(1)]);
    expect(packagingForItem({ categorySlug: "sirupy", volumeMl: 650, sku: "x" })).toEqual([{ name: PACKAGING.syrup650, quantity: 1 }, ...L(1)]);
    expect(packagingForItem({ categorySlug: "polevky", volumeMl: 1350, sku: "polevky-3x450" })).toEqual([{ name: PACKAGING.clear500, quantity: 3 }, ...L(3)]);
    expect(packagingForItem({ categorySlug: "sety", volumeMl: null, sku: "set" })).toEqual([]);
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
      { name: PACKAGING.labels, quantity: 12 },
      { name: PACKAGING.pouch250, quantity: 4 },
    ]);
  });
});
