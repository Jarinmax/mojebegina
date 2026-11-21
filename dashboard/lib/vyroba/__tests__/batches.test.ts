import { describe, expect, it } from "vitest";
import { pgArrayLiteral, productCode, batchCode, bestBefore, daysUntil, productAbbr, shelfLifeLabel, validateBatchInput } from "../batches";

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
  it("kódy výrobků", () => {
    expect(productCode("polevky", "dynova-polevka")).toBe("DYN");
    expect(productCode("sirupy", "medunkovy-sirup-s-levanduli")).toBe("MEL");
    expect(productCode("sirupy", "lipovy-sirup")).toBe("LIP");
    expect(productCode("caje", "lipovy-caj")).toBe("LIPC");
  });
  it("zkratky", () => {
    expect(productAbbr("dynova-polevka")).toBe("DYN");
    expect(productAbbr("kulajda")).toBe("KUL");
    expect(productAbbr("gulasova-polevka-z-hlivy-ustricne")).toBe("GHU");
    expect(productAbbr("rajcatova-polevka-s-cervenou-repou")).toBe("RCR");
    expect(productAbbr("bylinny-sirup-saman")).toBe("SAM");
  });
  it("číslo šarže s datem a pořadím", () => {
    expect(batchCode("polevky", "dynova-polevka", "2026-11-21")).toBe("L-20261121-DYN-01");
    expect(batchCode("sirupy", "lipovy-sirup", "2026-11-21", 2)).toBe("L-20261121-LIP-02");
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
  it("ruční číslo šarže musí sedět s datem", () => {
    const base = { productId: id, producedOn: "2026-11-17", lines: [{ volumeMl: 650, quantity: 9 }] };
    expect(validateBatchInput({ ...base, code: "l-20261117-mel-01" }, "2026-11-21")).toMatchObject({ ok: true, value: { code: "L-20261117-MEL-01" } });
    expect(validateBatchInput({ ...base, code: "L-20261118-MEL-01" }, "2026-11-21").ok).toBe(false);
    expect(validateBatchInput({ ...base, code: "PMEL-171126" }, "2026-11-21").ok).toBe(false);
  });
  it("dny do spotřeby", () => {
    expect(daysUntil("2026-11-24", "2026-11-21")).toBe(3);
  });
});

describe("šarže – pole do SQL", () => {
  it("jeden parametr místo seznamu", () => {
    expect(pgArrayLiteral(["ochutnavka-provoz"])).toBe("{ochutnavka-provoz}");
    expect(() => pgArrayLiteral(["x'); drop"])).toThrow();
  });
});
