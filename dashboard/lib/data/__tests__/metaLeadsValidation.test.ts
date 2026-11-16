import { describe, expect, it } from "vitest";
import { describeMetaLead, findExistingLead, formatMetaPhone, mapVenueType, parseMetaSheet } from "../metaLeadsValidation";

// Hlavička a řádky přesně jako v tabulce „Bekinka Beginka“ (export Mety, 16. 11. 2026).
const HEADER = [
  "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name", "form_id", "form_name",
  "is_organic", "platform", "jaký_typ_provozovny_máte_?", "kapacita_vašeho_podniku_?", "full name", "email", "phone_number", "city", "lead_status",
];
const ROW_MAREK = [
  "l:3188005584924076", "2026-11-14T01:48:35-05:00", "ag:1", "BEGINA karusel", "as:1", "BEGINA karusel", "c:1", "BEGINA karusel", "f:1",
  "begina.cz KARUSEL Prosinec", "false", "fb", "kavárna", "cca 15", "Marek Baroš", "barosmarek123@gmail.com", "p:+420725156602", "Praha", "CREATED",
];
const ROW_LENKA = [
  "l:2314970179357320", "2026-11-15T14:47:14-05:00", "ag:1", "BEGINA karusel", "as:1", "BEGINA karusel", "c:1", "BEGINA karusel", "f:1",
  "begina.cz KARUSEL Prosinec", "false", "fb", "Kavarna", "20", "Lenka Gruntova", "Legrunt@seznam.cz", "p:+420723485618", "Sušice", "CREATED",
];

describe("parseMetaSheet — export formuláře Meta", () => {
  it("načte řádky podle názvů sloupců (ne podle pořadí)", () => {
    const { rows, skipped, missingColumns } = parseMetaSheet([HEADER, ROW_MAREK, ROW_LENKA]);
    expect(missingColumns).toEqual([]);
    expect(skipped).toEqual([]);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      metaLeadId: "l:3188005584924076",
      campaignName: "BEGINA karusel",
      formName: "begina.cz KARUSEL Prosinec",
      platform: "fb",
      venueTypeRaw: "kavárna",
      venueType: "kavarna",
      capacity: "cca 15",
      fullName: "Marek Baroš",
      email: "barosmarek123@gmail.com",
      phone: "+420 725 156 602",
      city: "Praha",
    });
    expect(rows[0].submittedAt?.toISOString()).toBe("2026-11-14T06:48:35.000Z");
    expect(rows[1]).toMatchObject({ email: "legrunt@seznam.cz", phone: "+420 723 485 618", venueType: "kavarna" });

    // přeházené sloupce dají stejný výsledek
    const order = HEADER.map((_, i) => i).reverse();
    const shuffled = parseMetaSheet([order.map((i) => HEADER[i]), order.map((i) => ROW_MAREK[i])]);
    expect(shuffled.rows[0]).toEqual({ ...rows[0] });
  });

  it("prázdné řádky přeskočí, testovací lead a řádek bez kontaktu vyřadí s důvodem", () => {
    const test = [...ROW_MAREK];
    test[0] = "l:1";
    test[14] = "<test lead: dummy data for full_name>";
    const noContact = [...ROW_MAREK];
    noContact[0] = "l:2";
    noContact[15] = "";
    noContact[16] = "";
    const noId = [...ROW_MAREK];
    noId[0] = "";
    const r = parseMetaSheet([HEADER, [], ["", ""], test, noContact, noId]);
    expect(r.rows).toEqual([]);
    expect(r.skipped).toEqual([
      { rowNumber: 4, reason: "test_lead" },
      { rowNumber: 5, reason: "no_contact" },
      { rowNumber: 6, reason: "no_id" },
    ]);
  });

  it("chybějící povinný sloupec nahlásí a nic nenačte", () => {
    expect(parseMetaSheet([["id", "full name", "email"], ["l:1", "X", "x@y.cz"]]).missingColumns).toEqual(["phone"]);
  });
});

describe("pomocné převody", () => {
  it("telefon jako u ostatních kontaktů", () => {
    expect(formatMetaPhone("p:+420725156602")).toBe("+420 725 156 602");
    expect(formatMetaPhone("p:775111265")).toBe("+420 775 111 265");
    expect(formatMetaPhone("420773191271")).toBe("+420 773 191 271");
    expect(formatMetaPhone("p:+421905123456")).toBe("+421 905 123 456");
    expect(formatMetaPhone("p:+4207257972")).toBe("+4207257972"); // neúplné číslo beze změny
    expect(formatMetaPhone("")).toBeNull();
  });

  it("typ provozovny z volného textu", () => {
    expect(mapVenueType("kavárna")).toBe("kavarna");
    expect(mapVenueType("Kafe koutek")).toBe("kavarna");
    expect(mapVenueType("Bistro bar")).toBe("bistro");
    expect(mapVenueType("Hospůdka")).toBe("restaurace");
    expect(mapVenueType("penzion")).toBe("hotel");
    expect(mapVenueType("stánek")).toBe("jine");
    expect(mapVenueType(null)).toBe("jine");
  });

  it("stávající kontakt podle posledních 9 číslic telefonu nebo e-mailu", () => {
    const existing = [
      { id: "lenka", contactPhone: "+420 723 485 618", contactEmail: "legrunt@seznam.cz" },
      { id: "jiny", contactPhone: null, contactEmail: "barosmarek123@gmail.com" },
    ];
    expect(findExistingLead({ phone: "+420 723 485 618", email: null }, existing)).toBe("lenka");
    expect(findExistingLead({ phone: null, email: "BarosMarek123@gmail.com" }, existing)).toBe("jiny");
    expect(findExistingLead({ phone: "+420 111 222 333", email: "nikdo@x.cz" }, existing)).toBeNull();
  });

  it("text do historie", () => {
    const [row] = parseMetaSheet([HEADER, ROW_MAREK]).rows;
    expect(describeMetaLead(row, "14. 11. 2026 v 7:48")).toBe(
      "Formulář z Mety vyplněn 14. 11. 2026 v 7:48 (Facebook). provozovna: kavárna, kapacita: cca 15, město: Praha, kampaň: BEGINA karusel, formulář: begina.cz KARUSEL Prosinec."
    );
  });
});
