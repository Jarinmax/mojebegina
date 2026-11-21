import { describe, expect, it } from "vitest";
import { batchCode, bestBefore, daysUntil, productAbbr, shelfLifeLabel, validateBatchInput } from "../batches";

describe("šarže – trvanlivost", () => {
  it("polévky a čaje 3 týdny", () => {
    expect(bestBefore("2026-11-21", "polevky", 3000)).toBe("2026-12-12");
    expect(bestBefore("2026-11-21", "caje", 3000)).toBe("2026-12-12");
    expect(shelfLifeLabel("polevky", 3000)).toBe("3 týdny");
  });
  it("sirup 3 l 6 měsíců, sáček 3 měsíce", () => {
    expect(bestBefore("2026-11-21", "sirupy", 3000)).toBe("2027-05-21");
    expect(bestBefore("2026-11-21", "sirupy", 650)).toBe("2027-02-21");
    expect(bestBefore("2026-11-30", "sirupy", 100)).toBe("2027-02-28");
  });
  it("neznámá kategorie = ručně", () => {
    expect(bestBefore("2026-11-21", "zmrzliny", 500)).toBeNull();
  });
});

describe("šarže – číslo", () => {
  it("zkratky", () => {
    expect(productAbbr("dynova-polevka")).toBe("DYN");
    expect(productAbbr("kulajda")).toBe("KUL");
    expect(productAbbr("gulasova-polevka-z-hlivy-ustricne")).toBe("GHU");
    expect(productAbbr("rajcatova-polevka-s-cervenou-repou")).toBe("RCR");
    expect(productAbbr("bylinny-sirup-saman")).toBe("SAM");
  });
  it("číslo šarže s datem a pořadím", () => {
    expect(batchCode("polevky", "dynova-polevka", "2026-11-21")).toBe("PDYN-211126");
    expect(batchCode("sirupy", "lipovy-sirup", "2026-11-21", 2)).toBe("SLIP-211126-2");
  });
});

describe("šarže – vstup", () => {
  const id = "67d70837-4015-420e-847b-7e4c59733cb8";
  it("přijme platný vstup a vynechá nuly", () => {
    const r = validateBatchInput({ productId: id, producedOn: "2026-11-21", lines: [{ volumeMl: 3000, quantity: 8 }, { volumeMl: 650, quantity: 0 }] }, "2026-11-21");
    expect(r).toEqual({ ok: true, value: { productId: id, producedOn: "2026-11-21", lines: [{ volumeMl: 3000, quantity: 8, bestBefore: null }], note: null } });
  });
  it("odmítne budoucí datum a prázdná balení", () => {
    expect(validateBatchInput({ productId: id, producedOn: "2026-11-22", lines: [{ volumeMl: 3000, quantity: 1 }] }, "2026-11-21").ok).toBe(false);
    expect(validateBatchInput({ productId: id, lines: [] }, "2026-11-21").ok).toBe(false);
  });
  it("dny do spotřeby", () => {
    expect(daysUntil("2026-11-24", "2026-11-21")).toBe(3);
  });
});
