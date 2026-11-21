import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
import { itemTarget, planAllocations } from "../batchAllocation";

describe("šarže → objednávky", () => {
  const lines = [
    { lineId: "new", productSlug: "dynova-polevka", volumeMl: 3000, remaining: 8, bestBefore: "2026-12-12", producedOn: "2026-11-21" },
    { lineId: "old", productSlug: "dynova-polevka", volumeMl: 3000, remaining: 2, bestBefore: "2026-12-01", producedOn: "2026-11-10" },
    { lineId: "syr", productSlug: "lipovy-sirup", volumeMl: 650, remaining: 5, bestBefore: "2027-02-21", producedOn: "2026-11-21" },
  ];
  it("bere nejdřív šarži s nejbližším datem spotřeby", () => {
    const r = planAllocations([{ itemId: "i1", productSlug: "dynova-polevka", volumeMl: 3000, need: 5 }], lines);
    expect(r.allocations).toEqual([
      { itemId: "i1", lineId: "old", quantity: 2 },
      { itemId: "i1", lineId: "new", quantity: 3 },
    ]);
    expect(r.missing).toEqual([]);
  });
  it("hlásí chybějící kusy a nemíchá balení", () => {
    const r = planAllocations([{ itemId: "i2", productSlug: "lipovy-sirup", volumeMl: 3000, need: 1 }], lines);
    expect(r.allocations).toEqual([]);
    expect(r.missing).toEqual([{ itemId: "i2", quantity: 1 }]);
  });
  it("ochutnávka do podniku podle SKU, set sirupů bez šarže", () => {
    expect(itemTarget({ sku: "ochutnavka-polevka-kulajda", productSlug: "x", categorySlug: "ochutnavka-provoz", volumeMl: 200 })).toEqual({ productSlug: "kulajda", volumeMl: 200 });
    expect(itemTarget({ sku: "ochutnavka-sirup-lipovy-sirup", productSlug: "x", categorySlug: null, volumeMl: 100 })).toEqual({ productSlug: "lipovy-sirup", volumeMl: 100 });
    expect(itemTarget({ sku: "set-sirupy-5x100", productSlug: "ochutnavkovy-set-sirupu", categorySlug: "sirupy", volumeMl: 500 })).toBeNull();
  });
});
