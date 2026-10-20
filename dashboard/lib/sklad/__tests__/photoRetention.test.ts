import { describe, expect, it } from "vitest";
import { accountingRetentionUntil, decidePhotoRetention } from "../photoRetention";

const NOW = new Date("2026-10-20T10:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("uchovávání originálních fotek dokladů — jen rozhodnutí, nic se nemaže", () => {
  it("potvrzená příjemka: drží se do konce 10. roku po roce data dokladu", () => {
    expect(
      decidePhotoRetention({ kind: "page", receiptStatus: "confirmed", documentDate: "2026-10-05", confirmedAt: daysAgo(10), receiptUpdatedAt: daysAgo(10) }, NOW)
    ).toEqual({ action: "keep", until: "2036-12-31", reason: "účetní doklad potvrzené příjemky" });
  });

  it("stornovaná (dřív potvrzená) příjemka se drží stejně dlouho — storno doklad nevymaže z účetnictví", () => {
    expect(
      decidePhotoRetention({ kind: "page", receiptStatus: "voided", documentDate: "2026-01-02", confirmedAt: daysAgo(200), receiptUpdatedAt: daysAgo(5) }, NOW)
    ).toMatchObject({ action: "keep", until: "2036-12-31" });
  });

  it("po uplynutí lhůty je to jen KANDIDÁT ke smazání (mazání schvaluje člověk)", () => {
    expect(
      decidePhotoRetention(
        { kind: "page", receiptStatus: "confirmed", documentDate: "2015-06-30", confirmedAt: new Date("2015-07-01T00:00:00Z"), receiptUpdatedAt: new Date("2015-07-01T00:00:00Z") },
        new Date("2026-01-01T00:00:00Z")
      )
    ).toEqual({ action: "delete_candidate", reason: "účetní lhůta uplynula 2025-12-31" });
    // poslední den lhůty se ještě drží
    expect(
      decidePhotoRetention(
        { kind: "page", receiptStatus: "confirmed", documentDate: "2015-06-30", confirmedAt: new Date("2015-07-01T00:00:00Z"), receiptUpdatedAt: new Date("2015-07-01T00:00:00Z") },
        new Date("2025-12-31T12:00:00Z")
      ).action
    ).toBe("keep");
  });

  it("bez data dokladu se lhůta počítá od roku potvrzení; bez potvrzení se potvrzená příjemka nikdy nemaže", () => {
    expect(accountingRetentionUntil(null, new Date("2026-03-01T00:00:00Z"))).toBe("2036-12-31");
    expect(decidePhotoRetention({ kind: "page", receiptStatus: "confirmed", documentDate: null, confirmedAt: null, receiptUpdatedAt: daysAgo(9999) }, NOW)).toMatchObject({
      action: "keep",
    });
  });

  it("opuštěný návrh: kandidát až po 180 dnech beze změny", () => {
    const draft = (days: number) =>
      decidePhotoRetention({ kind: "page", receiptStatus: "draft", documentDate: null, confirmedAt: null, receiptUpdatedAt: daysAgo(days) }, NOW).action;
    expect(draft(179)).toBe("keep");
    expect(draft(180)).toBe("delete_candidate");
  });

  it("soubor bez příjemky: 7 dní ochranná lhůta; neznámý stav se nemaže nikdy", () => {
    expect(decidePhotoRetention({ kind: "orphan", uploadedAt: daysAgo(6) }, NOW).action).toBe("keep");
    expect(decidePhotoRetention({ kind: "orphan", uploadedAt: daysAgo(7) }, NOW).action).toBe("delete_candidate");
    expect(
      decidePhotoRetention({ kind: "page", receiptStatus: "archived", documentDate: "2000-01-01", confirmedAt: daysAgo(9999), receiptUpdatedAt: daysAgo(9999) }, NOW)
    ).toMatchObject({ action: "keep" });
  });
});
