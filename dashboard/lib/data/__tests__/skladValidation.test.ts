// Security Phase 22 (Sklad 1.0 — bezpečný základ) — testy čisté logiky
// (bez DB, bez "server-only"), stejná konvence jako
// dailyCallsValidation.test.ts.
import { describe, expect, it } from "vitest";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  buildDocumentPagePathname,
  computeNormalizedQuantity,
  computeVatRatePercent,
  extractedReceiptSchema,
  isValidDocumentPagePathname,
  isValidIco,
  isValidSha256Hex,
  normalizeExtractedLine,
  normalizeText,
  parseDecimal,
  parseHaler,
  sanitizeExtractedDocumentDate,
  sanitizeExtractedIco,
  validateDocumentPageInput,
  validateManualLineInput,
  validateStockItemInput,
  validateSupplierInput,
  validateVatReviewInput,
  type ManualLineInput,
} from "../skladValidation";

describe("computeVatRatePercent — DPH se vždy DOPOČÍTÁ z částek, nikdy nečte z kódu", () => {
  // Čísla tady jsou syntetická (ne přepis reálné faktury), ale ilustrují
  // přesně nález z reálné faktury Makro: sloupec vedle ceny (23/6) byl
  // nerozkódovaný dodavatelský kód oddělení, NE sazba DPH — přepočet ze
  // skutečných částek dal 21 %, resp. 12 %. Odtud požadavek "DPH urči z
  // částek, nikdy z tohoto sloupce" (revize návrhu, bod 2).
  it("částky dávající 21 % se nesmí zaměnit za dodavatelský kód '23'", () => {
    expect(computeVatRatePercent(17700, 21417)).toBeCloseTo(21, 0);
  });

  it("částky dávající 12 % se nesmí zaměnit za dodavatelský kód '6'", () => {
    expect(computeVatRatePercent(10000, 11200)).toBe(12);
  });

  it("nulová částka bez DPH nedělí nulou, vrátí 0", () => {
    expect(computeVatRatePercent(0, 0)).toBe(0);
  });

  it("shoda částek → 0 %", () => {
    expect(computeVatRatePercent(10000, 10000)).toBe(0);
  });
});

describe("computeNormalizedQuantity", () => {
  it("balení × jednotky v balení (karton 2 balení × 12 ks = 24 ks)", () => {
    expect(computeNormalizedQuantity(2, 12)).toBe(24);
  });

  it("vážené zboží s desetinným množstvím (1 balení × 1,142 kg)", () => {
    expect(computeNormalizedQuantity(1, 1.142)).toBeCloseTo(1.142, 6);
  });
});

describe("parseHaler / parseDecimal — český i anglický formát čísla", () => {
  it("parseHaler přijme čárku i tečku a zaokrouhlí na haléře", () => {
    expect(parseHaler("177,00")).toBe(17700);
    expect(parseHaler("177.00")).toBe(17700);
    expect(parseHaler("177,005")).toBe(17701); // zaokrouhlení nahoru
  });

  it("parseHaler vrátí null na neplatný vstup", () => {
    expect(parseHaler("")).toBeNull();
    expect(parseHaler("abc")).toBeNull();
  });

  it("parseDecimal zachová přesnost beze zaokrouhlení na haléře", () => {
    expect(parseDecimal("1,142")).toBeCloseTo(1.142, 6);
    expect(parseDecimal("177,123456")).toBeCloseTo(177.123456, 6);
  });
});

describe("isValidIco", () => {
  it("přijme přesně 8 číslic", () => {
    expect(isValidIco("74337297")).toBe(true);
  });

  it("odmítne jiný formát", () => {
    expect(isValidIco("7433729")).toBe(false);
    expect(isValidIco("743372977")).toBe(false);
    expect(isValidIco("CZ743372")).toBe(false);
  });
});

describe("normalizeText", () => {
  it("ořeže a sjednotí bílé znaky, převede na malá písmena", () => {
    expect(normalizeText("  Makro   Cash & Carry ČR  ")).toBe("makro cash & carry čr");
  });
});

function baseManualLine(overrides: Partial<ManualLineInput> = {}): ManualLineInput {
  return {
    rawDescription: "Tlačenka světlá speciál",
    supplierItemCode: "12345",
    supplierAuxiliaryCode: "23",
    rawPackageQuantity: "1",
    rawUnitsPerPackage: "1,142",
    rawUnit: "kg",
    normalizedUnit: "kg",
    unitPriceWithoutVat: "155,00",
    totalWithoutVatHal: "177,00",
    totalWithVatHal: "214,17",
    lineKind: "stock_material",
    stockItemId: "11111111-1111-1111-1111-111111111111",
    ...overrides,
  };
}

describe("validateManualLineInput", () => {
  it("platný vstup: vatHal se DOPOČÍTÁ jako rozdíl celkových částek, ne jako samostatné pole", () => {
    const result = validateManualLineInput(baseManualLine());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.vatHal).toBe(21417 - 17700);
      expect(result.value.totalWithVatHal).toBe(result.value.totalWithoutVatHal + result.value.vatHal);
      expect(result.value.computedVatRatePercent).toBeCloseTo(21, 0);
      expect(result.value.normalizedQuantity).toBeCloseTo(1.142, 6);
    }
  });

  it("odmítne prázdný popis", () => {
    const result = validateManualLineInput(baseManualLine({ rawDescription: "  " }));
    expect(result.ok).toBe(false);
  });

  it("odmítne nekladné množství balení", () => {
    const result = validateManualLineInput(baseManualLine({ rawPackageQuantity: "0" }));
    expect(result.ok).toBe(false);
  });

  it("odmítne cenu s DPH nižší než cenu bez DPH", () => {
    const result = validateManualLineInput(baseManualLine({ totalWithVatHal: "10000", totalWithoutVatHal: "17700" }));
    expect(result.ok).toBe(false);
  });

  it("odmítne neplatný druh položky", () => {
    const result = validateManualLineInput(baseManualLine({ lineKind: "neznamy_druh" }));
    expect(result.ok).toBe(false);
  });

  it("soukromá/nefiremní položka (non_stock_private) nesmí mít skladovou kartu", () => {
    const result = validateManualLineInput(
      baseManualLine({ lineKind: "non_stock_private", stockItemId: "11111111-1111-1111-1111-111111111111" })
    );
    expect(result.ok).toBe(false);
  });

  it("soukromá/nefiremní položka bez skladové karty je v pořádku", () => {
    const result = validateManualLineInput(baseManualLine({ lineKind: "non_stock_private", stockItemId: "" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stockItemId).toBeNull();
    }
  });

  it("skladová/zbožová položka bez skladové karty je odmítnuta", () => {
    const result = validateManualLineInput(baseManualLine({ stockItemId: "" }));
    expect(result.ok).toBe(false);
  });
});

describe("validateSupplierInput", () => {
  it("platné IČO i bez IČO (jen název)", () => {
    expect(validateSupplierInput({ name: "Makro Cash & Carry ČR", ico: "", dic: "" }).ok).toBe(true);
    expect(validateSupplierInput({ name: "Makro Cash & Carry ČR", ico: "74337297", dic: "CZ8005124303" }).ok).toBe(
      true
    );
  });

  it("odmítne neplatný formát IČO", () => {
    const result = validateSupplierInput({ name: "Test", ico: "12AB", dic: "" });
    expect(result.ok).toBe(false);
  });

  it("odmítne prázdný název", () => {
    expect(validateSupplierInput({ name: "  ", ico: "", dic: "" }).ok).toBe(false);
  });
});

describe("validateStockItemInput", () => {
  it("platný vstup", () => {
    const result = validateStockItemInput({ name: "Pivo 12°", canonicalUnit: "l", kind: "resale_goods" });
    expect(result.ok).toBe(true);
  });

  it("odmítne neplatný formát kanonické jednotky", () => {
    const result = validateStockItemInput({ name: "Pivo 12°", canonicalUnit: "Litr!", kind: "resale_goods" });
    expect(result.ok).toBe(false);
  });

  it("odmítne neplatný druh", () => {
    const result = validateStockItemInput({ name: "Pivo 12°", canonicalUnit: "l", kind: "neznamy" });
    expect(result.ok).toBe(false);
  });
});

describe("validateVatReviewInput — post-implementační audit, bod A", () => {
  it("platný vstup dopočítá vatHal a sazbu, stejně jako ruční zadání řádku", () => {
    const result = validateVatReviewInput({ totalWithoutVatHal: "177,00", totalWithVatHal: "214,17" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.vatHal).toBe(21417 - 17700);
      expect(result.value.computedVatRatePercent).toBeCloseTo(21, 0);
    }
  });

  it("odmítne cenu s DPH nižší než cenu bez DPH", () => {
    const result = validateVatReviewInput({ totalWithoutVatHal: "200,00", totalWithVatHal: "100,00" });
    expect(result.ok).toBe(false);
  });

  it("odmítne neplatný/chybějící vstup", () => {
    expect(validateVatReviewInput({ totalWithoutVatHal: "", totalWithVatHal: "100,00" }).ok).toBe(false);
    expect(validateVatReviewInput({ totalWithoutVatHal: "100,00", totalWithVatHal: "" }).ok).toBe(false);
  });
});

const RECEIPT_ID = "33333333-3333-3333-3333-333333333333";
const OTHER_RECEIPT_ID = "99999999-9999-9999-9999-999999999999";
const PAGE_UUID = "11111111-2222-3333-4444-555555555555";
const SHA256_SAMPLE = "a".repeat(64);

describe("isValidSha256Hex", () => {
  it("přijme přesně 64 hex znaků malými písmeny", () => {
    expect(isValidSha256Hex(SHA256_SAMPLE)).toBe(true);
  });

  it("odmítne velká písmena, jiný počet znaků i nehexová znaky", () => {
    expect(isValidSha256Hex(SHA256_SAMPLE.toUpperCase())).toBe(false);
    expect(isValidSha256Hex("a".repeat(63))).toBe(false);
    expect(isValidSha256Hex("g".repeat(64))).toBe(false);
  });
});

describe("buildDocumentPagePathname / isValidDocumentPagePathname", () => {
  it("vytvoří cestu tvaru sklad/<receiptId>/<uuid>.jpg a ta sama sobě projde validací", () => {
    const pathname = buildDocumentPagePathname(RECEIPT_ID, PAGE_UUID);
    expect(pathname).toBe(`sklad/${RECEIPT_ID}/${PAGE_UUID}.jpg`);
    expect(isValidDocumentPagePathname(RECEIPT_ID, pathname)).toBe(true);
  });

  it("odmítne cestu patřící jiné příjemce (bod 8 zadání — upload jen do správné příjemky)", () => {
    const pathname = buildDocumentPagePathname(OTHER_RECEIPT_ID, PAGE_UUID);
    expect(isValidDocumentPagePathname(RECEIPT_ID, pathname)).toBe(false);
  });

  it("odmítne jinou příponu nebo chybějící/poškozené id stránky", () => {
    expect(isValidDocumentPagePathname(RECEIPT_ID, `sklad/${RECEIPT_ID}/${PAGE_UUID}.png`)).toBe(false);
    expect(isValidDocumentPagePathname(RECEIPT_ID, `sklad/${RECEIPT_ID}/../../etc/passwd.jpg`)).toBe(false);
    expect(isValidDocumentPagePathname(RECEIPT_ID, `sklad/${RECEIPT_ID}/nejsem-uuid.jpg`)).toBe(false);
  });

  it("odmítne cestu bez správného prefixu vůbec", () => {
    expect(isValidDocumentPagePathname(RECEIPT_ID, `jiny-prefix/${PAGE_UUID}.jpg`)).toBe(false);
  });
});

describe("validateDocumentPageInput — kontrola PŘED zápisem do DB (bod 8 zadání)", () => {
  function baseInput(overrides: Partial<{ pathname: string; sha256: string; mimeType: string }> = {}) {
    return {
      pathname: buildDocumentPagePathname(RECEIPT_ID, PAGE_UUID),
      sha256: SHA256_SAMPLE,
      mimeType: "image/jpeg",
      ...overrides,
    };
  }

  it("platný vstup projde a normalizuje sha256/mimeType na malá písmena", () => {
    const result = validateDocumentPageInput(RECEIPT_ID, baseInput({ sha256: SHA256_SAMPLE.toUpperCase(), mimeType: "IMAGE/JPEG" }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sha256).toBe(SHA256_SAMPLE);
      expect(result.value.mimeType).toBe("image/jpeg");
    }
  });

  it("odmítne cestu, co nepatří zadané příjemce", () => {
    const result = validateDocumentPageInput(RECEIPT_ID, baseInput({ pathname: buildDocumentPagePathname(OTHER_RECEIPT_ID, PAGE_UUID) }));
    expect(result.ok).toBe(false);
  });

  it("odmítne neplatný sha256", () => {
    const result = validateDocumentPageInput(RECEIPT_ID, baseInput({ sha256: "neplatny-hash" }));
    expect(result.ok).toBe(false);
  });

  it("odmítne nepodporovaný MIME typ (bod 3 zadání: server přijímá jen JPEG z klientské konverze)", () => {
    const result = validateDocumentPageInput(RECEIPT_ID, baseInput({ mimeType: "image/heic" }));
    expect(result.ok).toBe(false);
  });

  it("ALLOWED_UPLOAD_MIME_TYPES obsahuje jen image/jpeg a MAX_UPLOAD_BYTES je kladné číslo", () => {
    expect(ALLOWED_UPLOAD_MIME_TYPES).toEqual(["image/jpeg"]);
    expect(MAX_UPLOAD_BYTES).toBeGreaterThan(0);
  });
});

// --- AI vytěžení účtenky ---------------------------------------------------

function baseExtractedLine(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    description: "Pivo 12°",
    supplierItemCode: "123",
    supplierAuxiliaryCode: null,
    packageQuantity: 2,
    unitsPerPackage: 12,
    unit: "ks",
    unitPriceWithoutVat: 25,
    totalWithoutVat: 600,
    vatAmount: 23, // záměrně nesmyslná hodnota — appka ji nikdy nepoužije
    totalWithVat: 726,
    suggestedCategory: "resale_goods",
    suggestedStockItemName: "Pivo 12°",
    suggestedCanonicalUnit: "l",
    ...overrides,
  };
}

function baseExtractedReceipt(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    supplierName: "Pivovar Náchod",
    supplierIco: "74337297",
    supplierDic: "CZ74337297",
    documentNumber: "FA2026001",
    documentDate: "2026-01-15",
    paymentMethod: "převodem",
    lines: [baseExtractedLine()],
    totalWithoutVat: 600,
    totalVat: 126,
    totalWithVat: 726,
    ...overrides,
  };
}

describe("extractedReceiptSchema — strukturovaný výstup modelu", () => {
  it("platný syntetický doklad projde", () => {
    const result = extractedReceiptSchema.safeParse(baseExtractedReceipt());
    expect(result.success).toBe(true);
  });

  it("vícestránkový doklad (víc řádků) je pořád jeden platný objekt", () => {
    const result = extractedReceiptSchema.safeParse(
      baseExtractedReceipt({
        lines: [
          baseExtractedLine({ description: "Pivo 12° (strana 1)" }),
          baseExtractedLine({ description: "Limonáda (strana 2)", supplierItemCode: "456" }),
        ],
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lines).toHaveLength(2);
    }
  });

  it("odmítne doklad bez řádků (prázdné pole)", () => {
    const result = extractedReceiptSchema.safeParse(baseExtractedReceipt({ lines: [] }));
    expect(result.success).toBe(false);
  });

  it("odmítne neplatnou kategorii návrhu (mimo 4 povolené)", () => {
    const result = extractedReceiptSchema.safeParse(
      baseExtractedReceipt({ lines: [baseExtractedLine({ suggestedCategory: "neznama_kategorie" })] })
    );
    expect(result.success).toBe(false);
  });

  it("chybějící/neznámé hodnoty jako null projdou (model se nemá nutit hádat)", () => {
    const result = extractedReceiptSchema.safeParse(
      baseExtractedReceipt({ supplierName: null, supplierIco: null, supplierDic: null, documentNumber: null, documentDate: null, paymentMethod: null })
    );
    expect(result.success).toBe(true);
  });

  it("odmítne záporné částky", () => {
    const result = extractedReceiptSchema.safeParse(
      baseExtractedReceipt({ lines: [baseExtractedLine({ totalWithoutVat: -10 })] })
    );
    expect(result.success).toBe(false);
  });
});

describe("normalizeExtractedLine — DPH se VŽDY dopočítá z částek, model se nikdy nevěří (bod 4 zadání)", () => {
  it("vatAmount z modelu se ZAHODÍ, appka si DPH dopočítá sama z obou celkových částek", () => {
    const line = baseExtractedLine({ totalWithoutVat: 100, totalWithVat: 121, vatAmount: 999999 });
    const result = normalizeExtractedLine(line as never);
    expect(result.vatHal).toBe(2100); // 12100 - 10000, NE 999999 (model)
    expect(result.totalWithVatHal).toBe(12100);
    expect(result.totalWithoutVatHal).toBe(10000);
  });

  it("číslo připomínající kód oddělení (vatAmount='23') se nikdy nepoužije jako sazba DPH", () => {
    // Přesně reálný nález z Makro faktury, co appka musí odolat i u AI
    // vytěžení: "23" vypadá jako sazba, ale je to kód oddělení, ne DPH.
    const line = baseExtractedLine({ totalWithoutVat: 177, totalWithVat: 214.17, vatAmount: 23 });
    const result = normalizeExtractedLine(line as never);
    expect(result.computedVatRatePercent).toBeCloseTo(21, 0);
  });

  it("normalizedQuantity se spočítá stejně jako u ručního zadání (balení × kusů v balení)", () => {
    const line = baseExtractedLine({ packageQuantity: 2, unitsPerPackage: 12 });
    const result = normalizeExtractedLine(line as never);
    expect(result.normalizedQuantity).toBe(24);
  });

  it("obrana proti nekonzistentním částkám z modelu (s DPH < bez DPH) — vatHal nikdy záporné", () => {
    const line = baseExtractedLine({ totalWithoutVat: 200, totalWithVat: 100 });
    const result = normalizeExtractedLine(line as never);
    expect(result.vatHal).toBeGreaterThanOrEqual(0);
  });

  it("prázdný dodavatelský/pomocný kód (null) zůstane null, ne prázdný řetězec", () => {
    const line = baseExtractedLine({ supplierItemCode: null, supplierAuxiliaryCode: null });
    const result = normalizeExtractedLine(line as never);
    expect(result.supplierItemCode).toBeNull();
    expect(result.supplierAuxiliaryCode).toBeNull();
  });
});

describe("sanitizeExtractedIco", () => {
  it("platné IČO projde beze změny", () => {
    expect(sanitizeExtractedIco("74337297")).toBe("74337297");
  });

  it("očistí mezery/pomlčky a ověří formát", () => {
    expect(sanitizeExtractedIco("743 372 97")).toBe("74337297");
    expect(sanitizeExtractedIco("743-37-297")).toBe("74337297");
  });

  it("neplatné/poškozené IČO se tiše zahodí (null), appka nespadne", () => {
    expect(sanitizeExtractedIco("abc")).toBeNull();
    expect(sanitizeExtractedIco("123")).toBeNull();
    expect(sanitizeExtractedIco(null)).toBeNull();
  });
});

describe("sanitizeExtractedDocumentDate", () => {
  it("platný formát YYYY-MM-DD projde", () => {
    expect(sanitizeExtractedDocumentDate("2026-01-15")).toBe("2026-01-15");
  });

  it("neplatný formát nebo null se zahodí (null), appka si nevymýšlí datum", () => {
    expect(sanitizeExtractedDocumentDate("15.1.2026")).toBeNull();
    expect(sanitizeExtractedDocumentDate("not a date")).toBeNull();
    expect(sanitizeExtractedDocumentDate(null)).toBeNull();
  });
});
