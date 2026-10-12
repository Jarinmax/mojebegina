// Mobilní tok 1.0 — AI vytěžení účtenky (needs_review). Stejný princip jako
// sklad.ts: kontrola a dotaz jsou neoddělitelné, každá exportovaná funkce
// si sama volá požadovanou skladAuth kontrolu. Odděleno do vlastního
// souboru (jméno anticipované už v komentáři u goods_receipts.extraction_status
// ve schema.ts), aby sklad.ts zůstal čistě o ručním zadání/potvrzení/stornu.
//
// Bezpečnostní invarianty (zadání, body 9+12):
//   - AI NIKDY nezapisuje vat_confirmed=true ani nepotvrzuje příjemku —
//     confirmGoodsReceipt (sklad.ts) tohle vynucuje NEZÁVISLE na téhle
//     funkci (vyžaduje vat_confirmed=true na KAŽDÉM řádku), takže i kdyby
//     tahle funkce měla chybu, confirmGoodsReceipt sama o sobě AI výstup
//     nikdy nepustí dál bez lidské revize.
//   - AI NIKDY nevytváří skladový pohyb — pohyby vznikají výhradně v
//     confirmGoodsReceipt, AI jen zapisuje goods_receipt_lines.
//   - Soukromá položka (non_stock_private) nikdy nedostane stock_item_id
//     (DB CHECK goods_receipt_lines_non_stock_has_no_item to vynucuje i
//     nezávisle na aplikační logice).
//   - Idempotence/souběh: start vytěžení je ATOMICKÝ claim (UPDATE …
//     WHERE extraction_status IN (…) AND NOT EXISTS (existující řádky)) —
//     dva souběžné požadavky nemůžou obě projít, a vytěžení NIKDY neběží
//     nad příjemkou, která už nějaké řádky má (ruční i z dřívějšího
//     úspěšného vytěžení) — chyba modelu tedy nemůže přepsat/poškodit už
//     existující (natož potvrzená) data. Selhání modelu nechá
//     extraction_status='failed' a NEZAPÍŠE žádný řádek — retry
//     (opakované kliknutí) začíná znovu od stejného claimu.
import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { get } from "@vercel/blob";
import { APICallError } from "ai";
import { GatewayError } from "@ai-sdk/gateway";
import { db } from "@/lib/db/client";
import {
  goodsReceiptActivity,
  goodsReceiptDocumentPages,
  goodsReceiptDocuments,
  goodsReceiptLines,
  goodsReceipts,
  stockItems,
  supplierItemMappings,
  suppliers,
} from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requirePricesAndOriginalAccess, requireReviewAccess, requireUploadAccess } from "./skladAuth";
import {
  normalizeExtractedLine,
  normalizeText,
  sanitizeExtractedDocumentDate,
  sanitizeExtractedIco,
  sanitizeExtractedReceipt,
  STOCK_ITEM_KINDS,
  type ExtractedReceiptLine,
  type LineKind,
} from "./skladValidation";
import { extractStructuredReceipt, EXTRACTION_MODEL_ID } from "./receiptExtractionModel";
import { preprocessReceiptPage, type PagePreprocessingDiagnostics, type ReceiptImageInput } from "./receiptImagePreprocessing";
import { performReceiptOcr, OCR_MODEL_ID, MIN_OCR_TEXT_LENGTH } from "./receiptOcrModel";
import { ModelOutputTruncatedError } from "./aiCallDiagnostics";

async function readBlobBytes(pathname: string): Promise<Buffer | null> {
  const blob = await get(pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return null;
  }
  const reader = blob.stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function fetchReceiptPageImages(
  receiptId: string
): Promise<{ images: ReceiptImageInput[]; diagnostics: PagePreprocessingDiagnostics[] }> {
  const pages = await db
    .select({
      storageKey: goodsReceiptDocumentPages.storageKey,
      mimeType: goodsReceiptDocumentPages.mimeType,
    })
    .from(goodsReceiptDocumentPages)
    .innerJoin(goodsReceiptDocuments, eq(goodsReceiptDocuments.id, goodsReceiptDocumentPages.documentId))
    .where(eq(goodsReceiptDocuments.receiptId, receiptId))
    .orderBy(goodsReceiptDocumentPages.pageNumber);

  const images: ReceiptImageInput[] = [];
  const diagnostics: PagePreprocessingDiagnostics[] = [];
  for (const page of pages) {
    const bytes = await readBlobBytes(page.storageKey);
    if (bytes) {
      // Oprava po prvním ostrém testu: appka pracuje jen s originálními
      // bajty už uloženými v Blobu (žádné nové focení se nevyžaduje) — před
      // OCR se každá strana ořízne/doostří/případně rozdělí na překrývající
      // se výřezy (receiptImagePreprocessing.ts); výsledek je jeden nebo
      // víc obrázků v pořadí shora dolů za každou stranu, plus bezpečná
      // diagnostika (rozměry/ořez/počet výřezů, nikdy obraz samotný).
      const processed = await preprocessReceiptPage({ mimeType: page.mimeType, bytes });
      images.push(...processed.images);
      diagnostics.push(processed.diagnostics);
    }
  }
  return { images, diagnostics };
}

async function fetchReceiptForExtraction(
  receiptId: string
): Promise<{ id: string; status: string; supplierId: string; documentNumber: string | null; documentDate: string | null; paymentMethod: string | null } | null> {
  const [receipt] = await db
    .select({
      id: goodsReceipts.id,
      status: goodsReceipts.status,
      supplierId: goodsReceipts.supplierId,
      documentNumber: goodsReceipts.documentNumber,
      documentDate: goodsReceipts.documentDate,
      paymentMethod: goodsReceipts.paymentMethod,
    })
    .from(goodsReceipts)
    .where(eq(goodsReceipts.id, receiptId))
    .limit(1);
  return receipt ?? null;
}

const EXTRACTION_ERROR_LOG_FIELD_LIMIT = 500;

function truncateForLog(value: string): string {
  return value.length > EXTRACTION_ERROR_LOG_FIELD_LIMIT ? `${value.slice(0, EXTRACTION_ERROR_LOG_FIELD_LIMIT)}…` : value;
}

// Bezpečný popis chyby z AI vytěžení pro server-side log (bod 1 zadání —
// "Udělej AI vytěžení neviditelné výjimky viditelnou, ale bezpečně"). Loguje
// JEN name/message/statusCode a bezpečně zkrácený responseBody, nikdy
// tokeny, bajty fotografie, prompt ani osobní údaje z účtenky — proto se
// nikdy nesahá na APICallError.url/requestBodyValues/responseHeaders,
// GatewayResponseError.response ani TypeValidationError.value (ty by mohly
// obsahovat echo promptu/obrázku nebo částečně vytěžená data z dokladu).
// Řetězec `cause` se prochází rekurzivně (do hloubky 5, proti cyklu).
function describeExtractionErrorForLog(error: unknown, depth = 0): unknown {
  if (depth > 5 || error == null) return undefined;
  if (!(error instanceof Error)) {
    return typeof error === "string" ? truncateForLog(error) : typeof error;
  }

  const info: Record<string, unknown> = { name: error.name, message: truncateForLog(error.message) };

  if (APICallError.isInstance(error)) {
    if (error.statusCode !== undefined) info.statusCode = error.statusCode;
    if (error.responseBody) info.responseBody = truncateForLog(error.responseBody);
  } else if (GatewayError.isInstance(error)) {
    info.statusCode = error.statusCode;
    if (error.generationId) info.generationId = error.generationId;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (cause !== undefined && cause !== error) {
    info.cause = describeExtractionErrorForLog(cause, depth + 1);
  }
  return info;
}

async function markExtractionFailed(receiptId: string): Promise<void> {
  try {
    await db
      .update(goodsReceipts)
      .set({ extractionStatus: "failed", updatedAt: new Date() })
      .where(eq(goodsReceipts.id, receiptId));
  } catch {
    // Zápis "failed" stavu je jen best-effort hláška pro uživatele — chyba
    // se tiše ignoruje, aby nezamaskovala původní chybu z modelu/vytěžení.
  }
}

// Model dosáhl výstupního limitu uprostřed OCR nebo strukturování
// (ModelOutputTruncatedError z aiCallDiagnostics.ts) — appka NEPŘIJME
// částečný výsledek jako dokončené vytěžení a NIKDY sama nezkouší další
// (placený) pokus, jen to jasně ohlásí jako technickou chybu. kind:
// "technical", ne "unreadable" — nejde o nejistotu kolem kvality fotky,
// appka tu VÍ přesně, co se stalo (finishReason "length", zalogováno
// bezpečně v aiCallDiagnostics.ts), jen to nedokáže sama dokončit.
async function truncatedExtractionResult(receiptId: string, phase: "ocr" | "structuring"): Promise<TriggerExtractionResult> {
  console.error(`[sklad] AI model dosáhl výstupního limitu (receiptId=${receiptId}, fáze=${phase}) — čtení nebylo dokončeno, bez dalšího pokusu.`);
  await markExtractionFailed(receiptId);
  return {
    ok: false,
    error: "Čtení dokladu se nepodařilo dokončit — model dosáhl limitu délky výstupu. Zkuste to znovu.",
    kind: "technical",
  };
}

// --- "Znovu přečíst doklad" (opakované AI vytěžení draft příjemky, co už
// může mít řádky) -----------------------------------------------------------
//
// ZÁSADNĚ odlišné od markExtractionFailed/truncatedExtractionResult výš —
// tyhle pracují jen s reextraction_status, NIKDY s extraction_status ani
// goods_receipt_lines. Selhání nového čtení tak nemůže poškodit ani jen
// signalizovat změnu u už existujících (natož potvrzených) dat — ty
// zůstávají přesně tak, jak byly před kliknutím na "Znovu přečíst doklad".
async function markReextractionFailed(receiptId: string): Promise<void> {
  try {
    await db
      .update(goodsReceipts)
      .set({ reextractionStatus: "failed", updatedAt: new Date() })
      .where(eq(goodsReceipts.id, receiptId));
  } catch {
    // Stejná zásada jako markExtractionFailed — best-effort hláška, chyba
    // zápisu se tiše ignoruje, aby nezamaskovala původní chybu z modelu.
  }
}

async function truncatedReextractionResult(receiptId: string, phase: "ocr" | "structuring"): Promise<TriggerExtractionResult> {
  console.error(`[sklad] Nové čtení dosáhlo výstupního limitu (receiptId=${receiptId}, fáze=${phase}) — čtení nebylo dokončeno, původní řádky beze změny.`);
  await markReextractionFailed(receiptId);
  return {
    ok: false,
    error: "Nové čtení dokladu se nepodařilo dokončit — model dosáhl limitu délky výstupu. Původní řádky zůstávají beze změny. Zkuste to znovu.",
    kind: "technical",
  };
}

// --- Dodavatel: IČO → normalizovaný název, NIKDY auto-vytvoření duplicity ---
//
// Příjemka má supplier_id už od založení (viz createDraftGoodsReceipt) —
// tahle funkce extrahovaný údaj použije jen k DOHLEDÁNÍ/OPRAVĚ na existující
// záznam (bod 5 zadání), nikdy k založení nového dodavatele. Když se nic
// nenajde, zůstává beze změny supplier_id nastavené při založení příjemky.
async function resolveSupplierId(
  currentSupplierId: string,
  extractedName: string | null,
  extractedIco: string | null
): Promise<{ supplierId: string; supplierNameSnapshot: string } | null> {
  if (extractedIco) {
    const [byIco] = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.ico, extractedIco))
      .limit(1);
    if (byIco && byIco.id !== currentSupplierId) {
      return { supplierId: byIco.id, supplierNameSnapshot: byIco.name };
    }
    if (byIco) return null; // matches current — no change needed
  }
  if (extractedName) {
    const normalized = normalizeText(extractedName);
    const [byName] = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.nameNormalized, normalized), isNull(suppliers.ico)))
      .limit(1);
    if (byName && byName.id !== currentSupplierId) {
      return { supplierId: byName.id, supplierNameSnapshot: byName.name };
    }
  }
  return null;
}

type ItemMappingMatch = { stockItemId: string; lineKind: LineKind; canonicalUnit: string };

// Mapuje nejdřív podle supplier_id + supplier_item_code, popis je jen
// fallback při chybějícím kódu (bod 6 zadání). Při nálezu bumpne
// last_used_at — "potom si ho systém zapamatuje" platí i pro OPAKOVANÉ
// použití, ne jen první zápis (bod 7 zadání). Vrací i canonicalUnit ze
// SKUTEČNÉ skladové karty (ne modelův odhad), aby normalizovaná jednotka
// u známého mapování vždy odpovídala tomu, na čem se karta vede.
async function findKnownMapping(supplierId: string, supplierItemCode: string | null, description: string): Promise<ItemMappingMatch | null> {
  const whereClause = supplierItemCode
    ? and(eq(supplierItemMappings.supplierId, supplierId), eq(supplierItemMappings.supplierItemCode, supplierItemCode))
    : and(
        eq(supplierItemMappings.supplierId, supplierId),
        eq(supplierItemMappings.descriptionNormalized, normalizeText(description)),
        isNull(supplierItemMappings.supplierItemCode)
      );

  const [mapping] = await db
    .select({
      id: supplierItemMappings.id,
      stockItemId: supplierItemMappings.stockItemId,
      lineKind: supplierItemMappings.lineKind,
      canonicalUnit: stockItems.canonicalUnit,
    })
    .from(supplierItemMappings)
    .innerJoin(stockItems, eq(stockItems.id, supplierItemMappings.stockItemId))
    .where(whereClause)
    .limit(1);
  if (!mapping) return null;

  await db.update(supplierItemMappings).set({ lastUsedAt: new Date() }).where(eq(supplierItemMappings.id, mapping.id));
  return { stockItemId: mapping.stockItemId, lineKind: mapping.lineKind as LineKind, canonicalUnit: mapping.canonicalUnit };
}

// Jeden vytěžený/sanitizovaný řádek doplněný o mapování na skladovou
// kartu — přesně tvar, který (a) triggerGoodsReceiptExtraction rovnou
// zapisuje do goods_receipt_lines, a (b) triggerGoodsReceiptReextraction
// ukládá do reextraction_raw.lines k porovnání PŘED jakýmkoli zápisem.
// Sdíleno, aby obě cesty počítaly normalizedUnit/mapping STEJNĚ (viz
// komentář u normalizedUnit níž — reálný nález na MAKRO faktuře).
export type ResolvedExtractionLine = {
  position: number;
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
  stockItemId: string | null;
  lineKind: LineKind;
  mappingSource: "auto" | null;
  suggestion: { category: string; stockItemName: string | null; canonicalUnit: string | null } | null;
};

// Dohledá mapování a dopočítá normalizedUnit/lineKind pro KAŽDÝ řádek,
// nezávisle na tom, jestli se hned zapíše do goods_receipt_lines
// (triggerGoodsReceiptExtraction), nebo jen uloží do reextraction_raw
// k porovnání (triggerGoodsReceiptReextraction). Volá findKnownMapping
// sekvenčně (ne Promise.all) — zachovává přesné pořadí řádků i u
// případných budoucích vedlejších účinků mapování (bump last_used_at).
async function resolveExtractedLines(supplierId: string, lines: ExtractedReceiptLine[]): Promise<ResolvedExtractionLine[]> {
  const resolved: ResolvedExtractionLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalized = normalizeExtractedLine(line);
    const mapping = await findKnownMapping(supplierId, normalized.supplierItemCode, normalized.rawDescription);

    // suggestedCategory je už sanitizovaná (sanitizeExtractedReceipt) na
    // jednu ze 4 povolených hodnot nebo null — žádná další kontrola
    // formátu tu není potřeba.
    const suggestedCategory = line.suggestedCategory;
    const lineKind: LineKind = mapping?.lineKind ?? (suggestedCategory as LineKind | null) ?? "stock_material";

    resolved.push({
      position: index + 1,
      rawDescription: normalized.rawDescription,
      supplierItemCode: normalized.supplierItemCode,
      supplierAuxiliaryCode: normalized.supplierAuxiliaryCode,
      rawPackageQuantity: normalized.rawPackageQuantity,
      rawUnitsPerPackage: normalized.rawUnitsPerPackage,
      rawUnit: normalized.rawUnit,
      normalizedQuantity: normalized.normalizedQuantity,
      // Reálný nález (MAKRO faktura): dřív tu byl i `line.suggestedCanonicalUnit`
      // jako druhá možnost PŘED rawUnit — u nenamapované položky se tak na
      // kontrolní obrazovce zobrazovala AI's NEZÁVAZNÝ návrh kanonické
      // jednotky (pro budoucí skladovou kartu, "jak tuhle položku
      // skladovat") jako by to byla OVĚŘENÁ jednotka NÁKUPU. Balení (BG,
      // "1 balení hranolků po 2,5 kg") se tak uživateli ukázalo jako
      // "1 kg" — appka ukazovala AI odhad namísto skutečně vytištěné
      // jednotky z dokladu. suggestedCanonicalUnit zůstává dál dostupný
      // (ExtractionSuggestion → MappingForm), jen se už nepoužije jako
      // zobrazená jednotka NEPOTVRZENÉHO řádku — dokud je mapování
      // nepotvrzené, appka ukazuje jen to, co skutečně stálo na dokladu.
      normalizedUnit: mapping?.canonicalUnit ?? normalized.rawUnit,
      unitPriceWithoutVat: normalized.unitPriceWithoutVat,
      totalWithoutVatHal: normalized.totalWithoutVatHal,
      vatHal: normalized.vatHal,
      totalWithVatHal: normalized.totalWithVatHal,
      computedVatRatePercent: normalized.computedVatRatePercent,
      stockItemId: mapping?.stockItemId ?? null,
      lineKind,
      mappingSource: mapping ? "auto" : null,
      suggestion: mapping
        ? null
        : {
            category: suggestedCategory ?? "stock_material",
            stockItemName: line.suggestedStockItemName,
            canonicalUnit: line.suggestedCanonicalUnit,
          },
    });
  }
  return resolved;
}

// `kind` rozlišuje DVĚ různé příčiny neúspěchu (po reálném nálezu s
// rozmazanou fotkou PENNY účtenky, kde appka nulový výsledek strukturování
// mylně prezentovala jako "vyfoťte ostřeji", ačkoli to nebylo prokázané):
//   - "technical" — jasná technická chyba (chybí fotka, volání modelu
//     selhalo, zápis do DB selhal, souběh/claim) — s kvalitou fotky to
//     nemá co dělat, appka to tak ani neformuluje.
//   - "unreadable" — appka z dokladu nezískala použitelný text/řádky, ale
//     PŘÍČINU NEZNÁ JISTĚ (může to být fotka, ale stejně tak obsah dokladu
//     nebo omezení modelu) — appka proto jen NABÍDNE výměnu fotky, nikdy
//     netvrdí, že fotka je prokázaně špatná.
export type TriggerExtractionFailureKind = "technical" | "unreadable";
export type TriggerExtractionResult = { ok: true } | { ok: false; error: string; kind: TriggerExtractionFailureKind };

// Spustí AI vytěžení nad VŠEMI nahranými stranami draft příjemky (bod 2
// zadání — server je čte po kontrole oprávnění, appka klientovi NIKDY
// originál neposílá). Idempotentní/souběh-bezpečné přes atomický claim
// (extraction_status), viz komentář na začátku souboru.
export async function triggerGoodsReceiptExtraction(receiptId: string): Promise<TriggerExtractionResult> {
  const ctx = requireUploadAccess(await getAuthContext());

  const receipt = await fetchReceiptForExtraction(receiptId);
  if (!receipt) {
    return { ok: false, error: "Příjemka nebyla nalezena.", kind: "technical" };
  }
  if (receipt.status !== "draft") {
    return { ok: false, error: "Vytěžit lze jen návrh příjemky.", kind: "technical" };
  }

  const claim = await db.execute<{ id: string }>(sql`
    UPDATE goods_receipts
    SET extraction_status = 'pending', updated_at = now()
    WHERE id = ${receiptId}
      AND status = 'draft'
      AND (
        extraction_status IN ('not_applicable', 'failed')
        OR (extraction_status = 'pending' AND updated_at < now() - interval '10 minutes')
      )
      AND NOT EXISTS (SELECT 1 FROM goods_receipt_lines WHERE receipt_id = ${receiptId})
    RETURNING id
  `);
  if (claim.rows.length === 0) {
    return {
      ok: false,
      error: "Vytěžení nelze spustit — příjemka už má zadané řádky, nebo vytěžení právě běží.",
      kind: "technical",
    };
  }

  const { images, diagnostics: pageDiagnostics } = await fetchReceiptPageImages(receiptId);
  if (images.length === 0) {
    await markExtractionFailed(receiptId);
    return { ok: false, error: "Nejdřív nahrajte aspoň jednu fotku dokladu.", kind: "technical" };
  }

  // Bezpečná diagnostika přípravy obrázku — jen rozměry/ořez/počet výřezů
  // (nikdy obraz samotný), ať je při ladění přesnosti vidět, jak moc appka
  // doklad ořízla a rozdělila. Loguje se vždy, i kdyby OCR níž selhalo.
  console.log(`[sklad] Příprava obrázku (receiptId=${receiptId}):`, pageDiagnostics);

  // FÁZE 1: čisté OCR (receiptOcrModel.ts) — obrázky → prostý text, žádné
  // strukturování tady. Druhý ostrý test (Preview 61c9755) ukázal, že
  // posílat obrázky rovnou do strukturovaného schématu (i s nano i s mini)
  // nestačilo; model specializovaný na OCR dostane jednodušší úkol.
  let ocrText: string;
  try {
    ocrText = await performReceiptOcr(images, receiptId);
  } catch (error) {
    if (error instanceof ModelOutputTruncatedError) {
      return truncatedExtractionResult(receiptId, error.phase);
    }
    console.error(`[sklad] OCR účtenky selhalo (receiptId=${receiptId}, model=${OCR_MODEL_ID}):`, describeExtractionErrorForLog(error));
    await markExtractionFailed(receiptId);
    return { ok: false, error: "Vytěžení dokladu se nezdařilo. Zkuste to znovu.", kind: "technical" };
  }

  const ocrCharCount = ocrText.trim().length;
  console.log(`[sklad] OCR diagnostika (receiptId=${receiptId}): ocrCharCount=${ocrCharCount}`);

  // Příliš málo textu → appka selže HNED tady, BEZ dalšího (placeného)
  // volání strukturovacího modelu — žádný smysl strukturovat prakticky
  // prázdný přepis.
  if (ocrCharCount < MIN_OCR_TEXT_LENGTH) {
    console.error(
      `[sklad] OCR vrátilo příliš málo textu (receiptId=${receiptId}): ocrCharCount=${ocrCharCount}, min=${MIN_OCR_TEXT_LENGTH}`
    );
    await markExtractionFailed(receiptId);
    // Nulový/nedostatečný výsledek OCR se NEOZNAČUJE za prokázanou špatnou
    // kvalitu fotky (bod 4 zadání po reálném nálezu) — appka jen nabídne
    // výměnu, nikdy netvrdí, že to JE příčina.
    return {
      ok: false,
      error:
        "Z fotky dokladu se nepodařilo přečíst dost textu. Nejde jistě říct, jestli je příčinou kvalita fotky, nebo něco jiného — zkuste to znovu, nebo nahrajte lepší fotografii.",
      kind: "unreadable",
    };
  }

  // FÁZE 2: strukturování OCR textu (receiptExtractionModel.ts) — text →
  // shovívavé RAW schéma → sanitizeExtractedReceipt tu bezpečně vyřadí
  // nečitelné/nesmyslné řádky, aby jediný vadný řádek neshodil celý doklad.
  let structuredRaw;
  try {
    structuredRaw = await extractStructuredReceipt(ocrText, receiptId);
  } catch (error) {
    if (error instanceof ModelOutputTruncatedError) {
      return truncatedExtractionResult(receiptId, error.phase);
    }
    console.error(
      `[sklad] Strukturování OCR textu selhalo (receiptId=${receiptId}, model=${EXTRACTION_MODEL_ID}):`,
      describeExtractionErrorForLog(error)
    );
    await markExtractionFailed(receiptId);
    return { ok: false, error: "Vytěžení dokladu se nezdařilo. Zkuste to znovu.", kind: "technical" };
  }

  const { receipt: extracted, droppedLineCount, diagnostics: sanitizeDiagnostics } = sanitizeExtractedReceipt(structuredRaw);
  // Bezpečná diagnostika sanitizace — jen POČTY (kolik řádků zahozeno a
  // proč, kolik mělo dopočítané množství/cenu), nikdy OCR text ani název
  // položky. rawLineCount/acceptedLineCount v `sanitizeDiagnostics` jsou
  // záměrně i v hlavní zprávě řádku logu (ne jen ve vnořeném objektu) —
  // reálný nález: droppedLineCount=0 samo o sobě vypadá STEJNĚ, ať už
  // strukturování vrátilo 0 syrových řádků, nebo všechny syrové řádky
  // prošly v pořádku; rawLineCount tenhle rozdíl ukáže na první pohled.
  console.log(
    `[sklad] Sanitizace řádků (receiptId=${receiptId}): rawLineCount=${sanitizeDiagnostics.rawLineCount}, acceptedLineCount=${sanitizeDiagnostics.acceptedLineCount}, droppedLineCount=${droppedLineCount}`,
    sanitizeDiagnostics
  );
  if (extracted.lines.length === 0) {
    await markExtractionFailed(receiptId);
    // Stejná zásada jako výš — appka OCR text přečetla (prošel
    // MIN_OCR_TEXT_LENGTH), ale strukturování z něj nenašlo žádnou
    // položku. Příčina může, ale nemusí být kvalita fotky (klidně i jen
    // omezení modelu) — appka to netvrdí jistě, jen nabízí výměnu.
    return {
      ok: false,
      error:
        "Z dokladu se nepodařilo rozpoznat žádnou použitelnou položku. Nejde jistě říct, jestli je příčinou kvalita fotky, nebo něco jiného — zkuste to znovu, nebo nahrajte lepší fotografii.",
      kind: "unreadable",
    };
  }

  try {
    const sanitizedIco = sanitizeExtractedIco(extracted.supplierIco);
    const resolvedSupplier = await resolveSupplierId(receipt.supplierId, extracted.supplierName, sanitizedIco);
    if (resolvedSupplier) {
      await db
        .update(goodsReceipts)
        .set({ supplierId: resolvedSupplier.supplierId, supplierNameSnapshot: resolvedSupplier.supplierNameSnapshot })
        .where(eq(goodsReceipts.id, receiptId));
    }
    const finalSupplierId = resolvedSupplier?.supplierId ?? receipt.supplierId;

    const resolvedLines = await resolveExtractedLines(finalSupplierId, extracted.lines);
    const extractionRawLines: Array<{
      position: number;
      suggestion: { category: string; stockItemName: string | null; canonicalUnit: string | null } | null;
    }> = [];

    for (const line of resolvedLines) {
      await db.insert(goodsReceiptLines).values({
        receiptId,
        position: line.position,
        rawDescription: line.rawDescription,
        supplierItemCode: line.supplierItemCode,
        supplierAuxiliaryCode: line.supplierAuxiliaryCode,
        rawPackageQuantity: line.rawPackageQuantity,
        rawUnitsPerPackage: line.rawUnitsPerPackage,
        rawUnit: line.rawUnit,
        normalizedQuantity: line.normalizedQuantity,
        normalizedUnit: line.normalizedUnit,
        unitPriceWithoutVat: line.unitPriceWithoutVat,
        totalWithoutVatHal: line.totalWithoutVatHal,
        vatHal: line.vatHal,
        totalWithVatHal: line.totalWithVatHal,
        computedVatRatePercent: line.computedVatRatePercent,
        vatConfirmed: false,
        stockItemId: line.stockItemId,
        lineKind: line.lineKind,
        mappingSource: line.mappingSource,
      });

      extractionRawLines.push({ position: line.position, suggestion: line.suggestion });
    }

    await db
      .update(goodsReceipts)
      .set({
        extractionStatus: "needs_review",
        extractionRaw: {
          model: EXTRACTION_MODEL_ID,
          ocrModel: OCR_MODEL_ID,
          extractedAt: new Date().toISOString(),
          lines: extractionRawLines,
        },
        documentNumber: receipt.documentNumber ?? extracted.documentNumber,
        documentDate: receipt.documentDate ?? sanitizeExtractedDocumentDate(extracted.documentDate),
        paymentMethod: receipt.paymentMethod ?? extracted.paymentMethod,
        updatedAt: new Date(),
      })
      .where(eq(goodsReceipts.id, receiptId));

    await db.insert(goodsReceiptActivity).values({
      receiptId,
      actorType: "system",
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "line_added",
      body: `AI vytěžilo ${extracted.lines.length} řádků (OCR: ${OCR_MODEL_ID}, struktura: ${EXTRACTION_MODEL_ID})${
        droppedLineCount > 0 ? `, ${droppedLineCount} nečitelných řádků přeskočeno` : ""
      } — čeká na kontrolu.`,
    });

    return { ok: true };
  } catch {
    await markExtractionFailed(receiptId);
    return { ok: false, error: "Zápis vytěžených dat selhal. Zkuste to znovu.", kind: "technical" };
  }
}

export type ExtractionSuggestion = { position: number; suggestion: { category: string; stockItemName: string | null; canonicalUnit: string | null } | null };

export async function getGoodsReceiptExtractionSuggestions(receiptId: string): Promise<ExtractionSuggestion[]> {
  requireReviewAccess(await getAuthContext());
  const [receipt] = await db.select({ extractionRaw: goodsReceipts.extractionRaw }).from(goodsReceipts).where(eq(goodsReceipts.id, receiptId)).limit(1);
  const raw = receipt?.extractionRaw as { lines?: ExtractionSuggestion[] } | null | undefined;
  return raw?.lines ?? [];
}

export type ConfirmMappingInput = { stockItemId: string | null; lineKind: string; rememberMapping: boolean };
export type ConfirmMappingResult = { ok: true } | { ok: false; error: string };

// Revize mapování na kontrolní obrazovce (bod 10 zadání) — vyžaduje
// requireReviewAccess, stejná brána jako addManualGoodsReceiptLine a
// reviewGoodsReceiptLineVat. Jakmile člověk potvrdí (i když jen přijme
// AI návrh beze změny), mapping_source se nastaví na 'manual' — lidské
// potvrzení je to, co se počítá jako skutečné rozhodnutí (bod 9 zadání:
// AI sama nikdy nic nepotvrzuje). Při rememberMapping=true se mapování
// zapamatuje do supplier_item_mappings pro příště (bod 7 zadání).
export async function confirmGoodsReceiptLineMapping(
  receiptId: string,
  lineId: string,
  input: ConfirmMappingInput
): Promise<ConfirmMappingResult> {
  const ctx = requireReviewAccess(await getAuthContext());

  const [receipt] = await db
    .select({ id: goodsReceipts.id, status: goodsReceipts.status, supplierId: goodsReceipts.supplierId })
    .from(goodsReceipts)
    .where(eq(goodsReceipts.id, receiptId))
    .limit(1);
  if (!receipt) {
    return { ok: false, error: "Příjemka nebyla nalezena." };
  }
  if (receipt.status !== "draft") {
    return { ok: false, error: "Mapování lze upravit jen u návrhu příjemky." };
  }

  const lineKindCandidates = [...STOCK_ITEM_KINDS, "non_stock_private"] as const;
  if (!lineKindCandidates.includes(input.lineKind as (typeof lineKindCandidates)[number])) {
    return { ok: false, error: "Vyberte druh položky." };
  }
  const lineKind = input.lineKind as LineKind;
  if (lineKind === "non_stock_private" && input.stockItemId) {
    return { ok: false, error: "Soukromá/nefiremní položka se nesmí napojit na skladovou kartu." };
  }
  if (lineKind !== "non_stock_private" && !input.stockItemId) {
    return { ok: false, error: "Vyberte nebo založte skladovou kartu." };
  }
  if (input.stockItemId) {
    const [item] = await db.select({ id: stockItems.id }).from(stockItems).where(eq(stockItems.id, input.stockItemId)).limit(1);
    if (!item) {
      return { ok: false, error: "Skladová karta nebyla nalezena." };
    }
  }

  const [line] = await db
    .select({
      id: goodsReceiptLines.id,
      supplierItemCode: goodsReceiptLines.supplierItemCode,
      rawDescription: goodsReceiptLines.rawDescription,
      rawUnitsPerPackage: goodsReceiptLines.rawUnitsPerPackage,
      rawUnit: goodsReceiptLines.rawUnit,
    })
    .from(goodsReceiptLines)
    .where(and(eq(goodsReceiptLines.id, lineId), eq(goodsReceiptLines.receiptId, receiptId)))
    .limit(1);
  if (!line) {
    return { ok: false, error: "Řádek nebyl nalezen." };
  }

  await db
    .update(goodsReceiptLines)
    .set({ stockItemId: input.stockItemId, lineKind, mappingSource: "manual", updatedAt: new Date() })
    .where(eq(goodsReceiptLines.id, lineId));

  if (input.rememberMapping && input.stockItemId) {
    const descriptionNormalized = line.supplierItemCode ? null : normalizeText(line.rawDescription);
    const matchClause = line.supplierItemCode
      ? and(eq(supplierItemMappings.supplierId, receipt.supplierId), eq(supplierItemMappings.supplierItemCode, line.supplierItemCode))
      : and(eq(supplierItemMappings.supplierId, receipt.supplierId), eq(supplierItemMappings.descriptionNormalized, descriptionNormalized!));

    const [existingMapping] = await db.select({ id: supplierItemMappings.id }).from(supplierItemMappings).where(matchClause).limit(1);
    if (existingMapping) {
      await db
        .update(supplierItemMappings)
        .set({ stockItemId: input.stockItemId, lineKind, lastUsedAt: new Date() })
        .where(eq(supplierItemMappings.id, existingMapping.id));
    } else {
      await db.insert(supplierItemMappings).values({
        supplierId: receipt.supplierId,
        supplierItemCode: line.supplierItemCode,
        descriptionNormalized,
        stockItemId: input.stockItemId,
        unitsPerPackage: line.rawUnitsPerPackage,
        packageUnitLabel: line.rawUnit,
        lineKind,
        createdByUserId: ctx.userId,
      });
    }
  }

  return { ok: true };
}

// --- "Znovu přečíst doklad" ------------------------------------------------
//
// Opakované AI vytěžení draft příjemky, co už může mít goods_receipt_lines
// (z ruční práce i z dřívějšího úspěšného/needs_review vytěžení). Zadání:
// původní řádky se zachovají, nový výsledek se uloží ODDĚLENĚ (jen do
// reextraction_raw, NIKDY do goods_receipt_lines/extraction_raw) a čeká na
// porovnání — teprve explicitní převzetí (acceptGoodsReceiptReextraction,
// sklad.ts) ho promítne do řádků. Chyba/useknutí v kterékoli fázi nechá
// reextraction_status='failed' a nesahá na extraction_status ani na
// existující řádky vůbec (viz markReextractionFailed výš) — proto appka
// smí znovu vytěžit, i když je extraction_status 'needs_review'/'succeeded'/
// 'failed', dokud je samotná příjemka draft.
//
// Idempotence/souběh: atomický claim na VLASTNÍM sloupci
// (reextraction_status + reextraction_claimed_at), stejný vzor jako
// extraction_status/updated_at u triggerGoodsReceiptExtraction výš — ale
// BEZ "NOT EXISTS (řádky)" podmínky, protože u téhle funkce je existence
// starých řádků to, co appka explicitně zachovává, ne důvod k zablokování.
export type ReextractionResult = TriggerExtractionResult;

async function fetchReceiptStatusForReextraction(
  receiptId: string
): Promise<{ id: string; status: string; supplierId: string; documentNumber: string | null; documentDate: string | null; paymentMethod: string | null; reextractionStatus: string } | null> {
  const [receipt] = await db
    .select({
      id: goodsReceipts.id,
      status: goodsReceipts.status,
      supplierId: goodsReceipts.supplierId,
      documentNumber: goodsReceipts.documentNumber,
      documentDate: goodsReceipts.documentDate,
      paymentMethod: goodsReceipts.paymentMethod,
      reextractionStatus: goodsReceipts.reextractionStatus,
    })
    .from(goodsReceipts)
    .where(eq(goodsReceipts.id, receiptId))
    .limit(1);
  return receipt ?? null;
}

export async function triggerGoodsReceiptReextraction(receiptId: string): Promise<ReextractionResult> {
  const ctx = requireUploadAccess(await getAuthContext());

  const receipt = await fetchReceiptStatusForReextraction(receiptId);
  if (!receipt) {
    return { ok: false, error: "Příjemka nebyla nalezena.", kind: "technical" };
  }
  if (receipt.status !== "draft") {
    return { ok: false, error: "Znovu přečíst lze jen návrh příjemky — potvrzené a stornované příjemky appka nemění.", kind: "technical" };
  }

  const claim = await db.execute<{ id: string }>(sql`
    UPDATE goods_receipts
    SET reextraction_status = 'pending', reextraction_claimed_at = now(), updated_at = now()
    WHERE id = ${receiptId}
      AND status = 'draft'
      AND (
        reextraction_status IN ('none', 'failed')
        OR (reextraction_status = 'pending' AND reextraction_claimed_at < now() - interval '10 minutes')
      )
    RETURNING id
  `);
  if (claim.rows.length === 0) {
    const message =
      receipt.reextractionStatus === "ready"
        ? "Nový výsledek už čeká na porovnání — nejdřív ho na příjemce zkontrolujte a převezměte nebo zahoďte."
        : "Nové čtení nelze spustit — právě běží jiný pokus.";
    return { ok: false, error: message, kind: "technical" };
  }

  const { images, diagnostics: pageDiagnostics } = await fetchReceiptPageImages(receiptId);
  if (images.length === 0) {
    await markReextractionFailed(receiptId);
    return { ok: false, error: "Nejdřív nahrajte aspoň jednu fotku dokladu.", kind: "technical" };
  }

  console.log(`[sklad] Znovu přečíst — příprava obrázku (receiptId=${receiptId}):`, pageDiagnostics);

  let ocrText: string;
  try {
    ocrText = await performReceiptOcr(images, receiptId);
  } catch (error) {
    if (error instanceof ModelOutputTruncatedError) {
      return truncatedReextractionResult(receiptId, error.phase);
    }
    console.error(`[sklad] Znovu přečíst — OCR účtenky selhalo (receiptId=${receiptId}, model=${OCR_MODEL_ID}):`, describeExtractionErrorForLog(error));
    await markReextractionFailed(receiptId);
    return { ok: false, error: "Nové čtení dokladu se nezdařilo. Původní řádky zůstávají beze změny. Zkuste to znovu.", kind: "technical" };
  }

  const ocrCharCount = ocrText.trim().length;
  console.log(`[sklad] Znovu přečíst — OCR diagnostika (receiptId=${receiptId}): ocrCharCount=${ocrCharCount}`);

  if (ocrCharCount < MIN_OCR_TEXT_LENGTH) {
    console.error(`[sklad] Znovu přečíst — OCR vrátilo příliš málo textu (receiptId=${receiptId}): ocrCharCount=${ocrCharCount}, min=${MIN_OCR_TEXT_LENGTH}`);
    await markReextractionFailed(receiptId);
    return {
      ok: false,
      error:
        "Z fotky dokladu se nepodařilo přečíst dost textu. Původní řádky zůstávají beze změny. Zkuste to znovu, nebo nahrajte lepší fotografii.",
      kind: "unreadable",
    };
  }

  let structuredRaw;
  try {
    structuredRaw = await extractStructuredReceipt(ocrText, receiptId);
  } catch (error) {
    if (error instanceof ModelOutputTruncatedError) {
      return truncatedReextractionResult(receiptId, error.phase);
    }
    console.error(
      `[sklad] Znovu přečíst — strukturování OCR textu selhalo (receiptId=${receiptId}, model=${EXTRACTION_MODEL_ID}):`,
      describeExtractionErrorForLog(error)
    );
    await markReextractionFailed(receiptId);
    return { ok: false, error: "Nové čtení dokladu se nezdařilo. Původní řádky zůstávají beze změny. Zkuste to znovu.", kind: "technical" };
  }

  const { receipt: extracted, droppedLineCount, diagnostics: sanitizeDiagnostics } = sanitizeExtractedReceipt(structuredRaw);
  console.log(
    `[sklad] Znovu přečíst — sanitizace řádků (receiptId=${receiptId}): rawLineCount=${sanitizeDiagnostics.rawLineCount}, acceptedLineCount=${sanitizeDiagnostics.acceptedLineCount}, droppedLineCount=${droppedLineCount}`,
    sanitizeDiagnostics
  );
  if (extracted.lines.length === 0) {
    await markReextractionFailed(receiptId);
    return {
      ok: false,
      error:
        "Z dokladu se nepodařilo rozpoznat žádnou použitelnou položku. Původní řádky zůstávají beze změny. Zkuste to znovu, nebo nahrajte lepší fotografii.",
      kind: "unreadable",
    };
  }

  try {
    // Na rozdíl od triggerGoodsReceiptExtraction výš appka tady dodavatele
    // JEN DOHLEDÁ (čistě čtecí resolveSupplierId), ale NEZAPISUJE ho do
    // goods_receipts — dokud uživatel nový výsledek nepřevezme, hlavička
    // příjemky zůstává beze změny stejně jako řádky.
    const sanitizedIco = sanitizeExtractedIco(extracted.supplierIco);
    const resolvedSupplier = await resolveSupplierId(receipt.supplierId, extracted.supplierName, sanitizedIco);
    const finalSupplierId = resolvedSupplier?.supplierId ?? receipt.supplierId;

    const resolvedLines = await resolveExtractedLines(finalSupplierId, extracted.lines);

    const reextractionRaw: ReextractionRawPayload = {
      extractedAt: new Date().toISOString(),
      ocrModel: OCR_MODEL_ID,
      model: EXTRACTION_MODEL_ID,
      droppedLineCount,
      supplierIdCandidate: resolvedSupplier?.supplierId ?? null,
      supplierNameCandidate: resolvedSupplier?.supplierNameSnapshot ?? null,
      documentNumber: extracted.documentNumber,
      documentDate: sanitizeExtractedDocumentDate(extracted.documentDate),
      paymentMethod: extracted.paymentMethod,
      totalWithoutVat: extracted.totalWithoutVat,
      totalVat: extracted.totalVat,
      totalWithVat: extracted.totalWithVat,
      lines: resolvedLines,
    };

    await db
      .update(goodsReceipts)
      .set({ reextractionStatus: "ready", reextractionRaw, updatedAt: new Date() })
      .where(eq(goodsReceipts.id, receiptId));

    await db.insert(goodsReceiptActivity).values({
      receiptId,
      actorType: "system",
      authorUserId: ctx.userId,
      authorName: ctx.name,
      kind: "reextraction_ready",
      body: `Nové čtení doplnilo návrh ${resolvedLines.length} řádků k porovnání (OCR: ${OCR_MODEL_ID}, struktura: ${EXTRACTION_MODEL_ID})${
        droppedLineCount > 0 ? `, ${droppedLineCount} nečitelných řádků přeskočeno` : ""
      } — čeká na rozhodnutí. Původní řádky nezměněny.`,
    });

    return { ok: true };
  } catch {
    await markReextractionFailed(receiptId);
    return { ok: false, error: "Uložení nového výsledku se nezdařilo. Původní řádky zůstávají beze změny. Zkuste to znovu.", kind: "technical" };
  }
}

export type ReextractionRawPayload = {
  extractedAt: string;
  ocrModel: string;
  model: string;
  droppedLineCount: number;
  supplierIdCandidate: string | null;
  supplierNameCandidate: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  paymentMethod: string | null;
  totalWithoutVat: number;
  totalVat: number;
  totalWithVat: number;
  lines: ResolvedExtractionLine[];
};

export type GoodsReceiptReextractionPreview = {
  status: "none" | "pending" | "ready" | "failed";
  raw: ReextractionRawPayload | null;
};

// Čtení pro porovnávací obrazovku (znovu-precist/page.tsx) — stejná brána
// jako listGoodsReceiptLines/getGoodsReceipt (requirePricesAndOriginalAccess),
// aby šlo porovnání ZOBRAZIT každému, kdo smí vidět ceny a originál;
// PŘEVZETÍ/ZAHOZENÍ (sklad.ts) vyžadují užší requireReviewAccess.
export async function getGoodsReceiptReextractionPreview(receiptId: string): Promise<GoodsReceiptReextractionPreview | null> {
  requirePricesAndOriginalAccess(await getAuthContext());
  const [receipt] = await db
    .select({ reextractionStatus: goodsReceipts.reextractionStatus, reextractionRaw: goodsReceipts.reextractionRaw })
    .from(goodsReceipts)
    .where(eq(goodsReceipts.id, receiptId))
    .limit(1);
  if (!receipt) return null;
  const status = receipt.reextractionStatus as GoodsReceiptReextractionPreview["status"];
  return { status, raw: status === "ready" ? (receipt.reextractionRaw as ReextractionRawPayload) : null };
}
