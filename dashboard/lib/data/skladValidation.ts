// Security Phase 22 (Sklad 1.0 — bezpečný základ) — čistá validace a
// výpočty, bez "server-only", stejný princip jako dailyCallsValidation.ts:
// testovatelné bez databáze, kontrola a dotaz se skládají až v sklad.ts.
export const STOCK_ITEM_KINDS = ["ingredient", "resale_goods", "operating_supply"] as const;
export type StockItemKind = (typeof STOCK_ITEM_KINDS)[number];

export const LINE_KINDS = ["stock_material", "resale_goods", "operating_supply", "non_stock_private"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

// Řádky, co se promítají do skladu — "non_stock_private" se do skladu
// nikdy nezapisuje (schváleno v původním zadání).
export const STOCK_AFFECTING_LINE_KINDS: ReadonlySet<LineKind> = new Set([
  "stock_material",
  "resale_goods",
  "operating_supply",
]);

const CODE_FORMAT_RE = /^[a-z][a-z0-9_]*$/;
const ICO_FORMAT_RE = /^[0-9]{8}$/;

export function isValidLocationOrUnitCode(code: string): boolean {
  return CODE_FORMAT_RE.test(code);
}

export function isValidIco(ico: string): boolean {
  return ICO_FORMAT_RE.test(ico);
}

// Normalizace pro dedup fallback (jméno dodavatele, popis položky) —
// jen ořez a sjednocení bílých znaků + malá písmena. Žádné odstraňování
// diakritiky (IČO je primární klíč dodavatele, normalizovaný název je jen
// fallback — nestojí za riziko, že "Pivovar Náchod" a "Pivovar Nachod"
// splynou omylem).
export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// Dopočítaná sazba DPH z částek (cena s DPH / cena bez DPH − 1) * 100 —
// NIKDY přečtená z nejasného sloupce (viz reálný nález na faktuře Makro:
// sloupec vedle ceny byl kód oddělení 23/6, ne sazba DPH). `totalWithoutVatHal`
// a `totalWithVatHal` jsou haléře (bigint na DB úrovni, number tady).
// totalWithoutVatHal === 0 nemá smysluplnou sazbu (řádek zdarma) — vrací 0.
export function computeVatRatePercent(totalWithoutVatHal: number, totalWithVatHal: number): number {
  if (totalWithoutVatHal === 0) {
    return 0;
  }
  const rate = ((totalWithVatHal - totalWithoutVatHal) / totalWithoutVatHal) * 100;
  return Math.round(rate * 1000) / 1000;
}

// Normalizované množství = počet nákupních balení × kolik kanonických
// jednotek je v balení. Platí stejně pro "karton 12×0,5l → 12 ks" (balení=2,
// faktor=12 → 24 ks) i pro vážené zboží (balení=1, faktor=1,142 → 1,142 kg,
// přesně příklad z reálné faktury Makro "*TLAČENKA SVĚTLÁ SPECIAL").
export function computeNormalizedQuantity(rawPackageQuantity: number, rawUnitsPerPackage: number): number {
  return Math.round(rawPackageQuantity * rawUnitsPerPackage * 1e6) / 1e6;
}

// Parsuje český i anglický formát desetinného čísla ("177,000" i "177.000")
// do haléřů (celé číslo). Vrací null při neplatném vstupu — validace výš
// rozhodne, jestli je to chyba.
export function parseHaler(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (normalized === "" || Number.isNaN(Number(normalized))) {
    return null;
  }
  return Math.round(Number(normalized) * 100);
}

// Parsuje desetinné číslo (množství, jednotková cena v Kč) — ŽÁDNÉ
// zaokrouhlení na haléře, zachovává přesnost pro vážené zboží a
// dodavatelské jednotkové ceny s víc než 2 desetinnými místy.
export function parseDecimal(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (normalized === "" || Number.isNaN(Number(normalized))) {
    return null;
  }
  return Number(normalized);
}

export type ManualLineInput = {
  rawDescription: string;
  supplierItemCode: string;
  supplierAuxiliaryCode: string;
  rawPackageQuantity: string;
  rawUnitsPerPackage: string;
  rawUnit: string;
  normalizedUnit: string;
  unitPriceWithoutVat: string;
  totalWithoutVatHal: string;
  totalWithVatHal: string;
  lineKind: string;
  stockItemId: string; // "" = zatím nenamapováno
};

export type ValidatedManualLine = {
  rawDescription: string;
  supplierItemCode: string | null;
  supplierAuxiliaryCode: string | null;
  rawPackageQuantity: number;
  rawUnitsPerPackage: number;
  rawUnit: string;
  normalizedQuantity: number;
  normalizedUnit: string;
  unitPriceWithoutVat: number;
  totalWithoutVatHal: number;
  vatHal: number;
  totalWithVatHal: number;
  computedVatRatePercent: number;
  lineKind: LineKind;
  stockItemId: string | null;
};

// Validace ručně zadaného řádku. `vatHal` se DOPOČÍTÁ jako rozdíl obou
// zadaných celkových částek (ne zadává se zvlášť) — vylučuje to
// nekonzistentní trojici čísel a automaticky splňuje DB CHECK
// goods_receipt_lines_total_consistent.
export function validateManualLineInput(
  input: ManualLineInput
): { ok: true; value: ValidatedManualLine } | { ok: false; error: string } {
  const rawDescription = input.rawDescription.trim();
  if (!rawDescription) {
    return { ok: false, error: "Popis položky je povinný." };
  }

  const rawPackageQuantity = parseDecimal(input.rawPackageQuantity);
  if (rawPackageQuantity === null || rawPackageQuantity <= 0) {
    return { ok: false, error: "Počet nákupních balení musí být kladné číslo." };
  }
  const rawUnitsPerPackage = parseDecimal(input.rawUnitsPerPackage);
  if (rawUnitsPerPackage === null || rawUnitsPerPackage <= 0) {
    return { ok: false, error: "Počet jednotek v balení musí být kladné číslo." };
  }
  const rawUnit = input.rawUnit.trim();
  if (!rawUnit) {
    return { ok: false, error: "Původní nákupní jednotka je povinná." };
  }
  const normalizedUnit = input.normalizedUnit.trim();
  if (!normalizedUnit) {
    return { ok: false, error: "Kanonická jednotka je povinná." };
  }

  const unitPriceWithoutVat = parseDecimal(input.unitPriceWithoutVat);
  if (unitPriceWithoutVat === null || unitPriceWithoutVat < 0) {
    return { ok: false, error: "Jednotková cena bez DPH musí být nezáporné číslo." };
  }
  const totalWithoutVatHal = parseHaler(input.totalWithoutVatHal);
  if (totalWithoutVatHal === null || totalWithoutVatHal < 0) {
    return { ok: false, error: "Cena celkem bez DPH musí být nezáporné číslo." };
  }
  const totalWithVatHal = parseHaler(input.totalWithVatHal);
  if (totalWithVatHal === null || totalWithVatHal < totalWithoutVatHal) {
    return { ok: false, error: "Cena celkem s DPH musí být vyplněná a ne nižší než cena bez DPH." };
  }

  const lineKind = input.lineKind.trim();
  if (!LINE_KINDS.includes(lineKind as LineKind)) {
    return { ok: false, error: "Vyberte druh položky." };
  }

  const stockItemId = input.stockItemId.trim();
  if (lineKind === "non_stock_private" && stockItemId) {
    return { ok: false, error: "Soukromá/nefiremní položka se nesmí napojit na skladovou kartu." };
  }
  if (lineKind !== "non_stock_private" && !stockItemId) {
    return { ok: false, error: "Vyberte nebo založte skladovou kartu." };
  }

  return {
    ok: true,
    value: {
      rawDescription,
      supplierItemCode: input.supplierItemCode.trim() || null,
      supplierAuxiliaryCode: input.supplierAuxiliaryCode.trim() || null,
      rawPackageQuantity,
      rawUnitsPerPackage,
      rawUnit,
      normalizedQuantity: computeNormalizedQuantity(rawPackageQuantity, rawUnitsPerPackage),
      normalizedUnit,
      unitPriceWithoutVat,
      totalWithoutVatHal,
      vatHal: totalWithVatHal - totalWithoutVatHal,
      totalWithVatHal,
      computedVatRatePercent: computeVatRatePercent(totalWithoutVatHal, totalWithVatHal),
      lineKind: lineKind as LineKind,
      stockItemId: stockItemId || null,
    },
  };
}

export type VatReviewInput = { totalWithoutVatHal: string; totalWithVatHal: string };
export type ValidatedVatReview = { totalWithoutVatHal: number; vatHal: number; totalWithVatHal: number; computedVatRatePercent: number };

// Post-implementační audit (bod A) — kontrolor při revizi DPH potvrzuje
// (případně opraví) jen obě celkové částky, stejně jako při ručním zadání
// řádku: `vatHal` a sazba se znovu DOPOČÍTAJÍ, nikdy se nezadávají zvlášť
// (stejná záruka konzistence jako u validateManualLineInput).
export function validateVatReviewInput(
  input: VatReviewInput
): { ok: true; value: ValidatedVatReview } | { ok: false; error: string } {
  const totalWithoutVatHal = parseHaler(input.totalWithoutVatHal);
  if (totalWithoutVatHal === null || totalWithoutVatHal < 0) {
    return { ok: false, error: "Cena celkem bez DPH musí být nezáporné číslo." };
  }
  const totalWithVatHal = parseHaler(input.totalWithVatHal);
  if (totalWithVatHal === null || totalWithVatHal < totalWithoutVatHal) {
    return { ok: false, error: "Cena celkem s DPH musí být vyplněná a ne nižší než cena bez DPH." };
  }
  return {
    ok: true,
    value: {
      totalWithoutVatHal,
      vatHal: totalWithVatHal - totalWithoutVatHal,
      totalWithVatHal,
      computedVatRatePercent: computeVatRatePercent(totalWithoutVatHal, totalWithVatHal),
    },
  };
}

export type SupplierInput = { name: string; ico: string; dic: string };
export type ValidatedSupplier = { name: string; nameNormalized: string; ico: string | null; dic: string | null };

export function validateSupplierInput(
  input: SupplierInput
): { ok: true; value: ValidatedSupplier } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Název dodavatele je povinný." };
  }
  const ico = input.ico.trim();
  if (ico && !isValidIco(ico)) {
    return { ok: false, error: "IČO musí mít přesně 8 číslic." };
  }
  const dic = input.dic.trim();
  return { ok: true, value: { name, nameNormalized: normalizeText(name), ico: ico || null, dic: dic || null } };
}

export type StockItemInput = { name: string; canonicalUnit: string; kind: string };
export type ValidatedStockItem = { name: string; canonicalUnit: string; kind: StockItemKind };

export function validateStockItemInput(
  input: StockItemInput
): { ok: true; value: ValidatedStockItem } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Název skladové karty je povinný." };
  }
  const canonicalUnit = input.canonicalUnit.trim().toLowerCase();
  if (!isValidLocationOrUnitCode(canonicalUnit)) {
    return { ok: false, error: "Kanonická jednotka smí obsahovat jen malá písmena, číslice a podtržítko." };
  }
  if (!STOCK_ITEM_KINDS.includes(input.kind as StockItemKind)) {
    return { ok: false, error: "Vyberte druh skladové karty." };
  }
  return { ok: true, value: { name, canonicalUnit, kind: input.kind as StockItemKind } };
}

// --- Foto stran dokladu --------------------------------------------------

// Mobilní tok 1.0 — klient VŽDY převede foto na JPEG (HEIC i velké
// originály) před uploadem (viz lib/sklad/clientUpload.ts), takže server
// přijímá jen tenhle jeden formát. Žádné OCR/AI zpracování obsahu zde —
// jen kontrola typu/velikosti/cesty.
export const ALLOWED_UPLOAD_MIME_TYPES = ["image/jpeg"] as const;
// 12 MB je bezpečná rezerva nad reálným výstupem klientské konverze
// (2200 px delší strana, kvalita ~85 % JPEG bývá řádově stovky kB až pár
// MB) — chrání před neúměrně velkým souborem, ne přesný odhad komprese.
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export function isValidSha256Hex(value: string): boolean {
  return SHA256_HEX_RE.test(value);
}

// Cesta v Blobu MUSÍ být tvaru "sklad/<receiptId>/<náhodné-id>.jpg" —
// vynucuje to i server při vydávání upload tokenu (authorizeGoodsReceiptUpload
// v sklad.ts), tahle kontrola je druhá, nezávislá pojistka při registraci
// stránky (revize zadání, bod 8: upload jen do správné příjemky).
export function buildDocumentPagePathname(receiptId: string, randomId: string): string {
  return `sklad/${receiptId}/${randomId}.jpg`;
}

export function isValidDocumentPagePathname(receiptId: string, pathname: string): boolean {
  const prefix = `sklad/${receiptId}/`;
  if (!pathname.startsWith(prefix)) {
    return false;
  }
  const rest = pathname.slice(prefix.length);
  return /^[0-9a-f-]{36}\.jpg$/.test(rest);
}

export type DocumentPageInput = { pathname: string; sha256: string; mimeType: string };
export type ValidatedDocumentPage = { pathname: string; sha256: string; mimeType: string };

// Kontrola PŘED zápisem do DB (post-implementační audit, bod 8) — ověřuje
// formát, ne obsah (obsah fotky appka nikdy neinterpretuje, žádné OCR).
export function validateDocumentPageInput(
  receiptId: string,
  input: DocumentPageInput
): { ok: true; value: ValidatedDocumentPage } | { ok: false; error: string } {
  const pathname = input.pathname.trim();
  if (!isValidDocumentPagePathname(receiptId, pathname)) {
    return { ok: false, error: "Neplatná cesta nahraného souboru." };
  }
  const sha256 = input.sha256.trim().toLowerCase();
  if (!isValidSha256Hex(sha256)) {
    return { ok: false, error: "Neplatný otisk (SHA-256) souboru." };
  }
  const mimeType = input.mimeType.trim().toLowerCase();
  if (!ALLOWED_UPLOAD_MIME_TYPES.includes(mimeType as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number])) {
    return { ok: false, error: "Nepodporovaný typ souboru — očekává se JPEG." };
  }
  return { ok: true, value: { pathname, sha256, mimeType } };
}
