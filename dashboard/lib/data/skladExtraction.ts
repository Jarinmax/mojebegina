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
import { requireReviewAccess, requireUploadAccess } from "./skladAuth";
import {
  normalizeExtractedLine,
  normalizeText,
  sanitizeExtractedDocumentDate,
  sanitizeExtractedIco,
  STOCK_ITEM_KINDS,
  type LineKind,
} from "./skladValidation";
import { extractReceiptData, EXTRACTION_MODEL_ID, type ReceiptImageInput } from "./receiptExtractionModel";

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

async function fetchReceiptPageImages(receiptId: string): Promise<ReceiptImageInput[]> {
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
  for (const page of pages) {
    const bytes = await readBlobBytes(page.storageKey);
    if (bytes) {
      images.push({ mimeType: page.mimeType, bytes });
    }
  }
  return images;
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

export type TriggerExtractionResult = { ok: true } | { ok: false; error: string };

// Spustí AI vytěžení nad VŠEMI nahranými stranami draft příjemky (bod 2
// zadání — server je čte po kontrole oprávnění, appka klientovi NIKDY
// originál neposílá). Idempotentní/souběh-bezpečné přes atomický claim
// (extraction_status), viz komentář na začátku souboru.
export async function triggerGoodsReceiptExtraction(receiptId: string): Promise<TriggerExtractionResult> {
  const ctx = requireUploadAccess(await getAuthContext());

  const receipt = await fetchReceiptForExtraction(receiptId);
  if (!receipt) {
    return { ok: false, error: "Příjemka nebyla nalezena." };
  }
  if (receipt.status !== "draft") {
    return { ok: false, error: "Vytěžit lze jen návrh příjemky." };
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
    };
  }

  const images = await fetchReceiptPageImages(receiptId);
  if (images.length === 0) {
    await markExtractionFailed(receiptId);
    return { ok: false, error: "Nejdřív nahrajte aspoň jednu fotku dokladu." };
  }

  let extracted;
  try {
    extracted = await extractReceiptData(images);
  } catch (error) {
    console.error(
      `[sklad] AI vytěžení účtenky selhalo (receiptId=${receiptId}, model=${EXTRACTION_MODEL_ID}):`,
      describeExtractionErrorForLog(error)
    );
    await markExtractionFailed(receiptId);
    return { ok: false, error: "Vytěžení dokladu se nezdařilo. Zkuste to znovu." };
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

    const extractionRawLines: Array<{
      position: number;
      suggestion: { category: string; stockItemName: string | null; canonicalUnit: string | null } | null;
    }> = [];

    for (let index = 0; index < extracted.lines.length; index += 1) {
      const line = extracted.lines[index];
      const normalized = normalizeExtractedLine(line);
      const mapping = await findKnownMapping(finalSupplierId, normalized.supplierItemCode, normalized.rawDescription);

      // suggestedCategory je už validovaná Zod enumem (extractedReceiptLineSchema)
      // na jednu ze 4 povolených hodnot nebo null — žádná další kontrola
      // formátu tu není potřeba.
      const suggestedCategory = line.suggestedCategory;
      const lineKind: LineKind = mapping?.lineKind ?? (suggestedCategory as LineKind | null) ?? "stock_material";

      await db.insert(goodsReceiptLines).values({
        receiptId,
        position: index + 1,
        rawDescription: normalized.rawDescription,
        supplierItemCode: normalized.supplierItemCode,
        supplierAuxiliaryCode: normalized.supplierAuxiliaryCode,
        rawPackageQuantity: normalized.rawPackageQuantity,
        rawUnitsPerPackage: normalized.rawUnitsPerPackage,
        rawUnit: normalized.rawUnit,
        normalizedQuantity: normalized.normalizedQuantity,
        normalizedUnit: mapping?.canonicalUnit ?? line.suggestedCanonicalUnit?.trim() ?? normalized.rawUnit,
        unitPriceWithoutVat: normalized.unitPriceWithoutVat,
        totalWithoutVatHal: normalized.totalWithoutVatHal,
        vatHal: normalized.vatHal,
        totalWithVatHal: normalized.totalWithVatHal,
        computedVatRatePercent: normalized.computedVatRatePercent,
        vatConfirmed: false,
        stockItemId: mapping?.stockItemId ?? null,
        lineKind,
        mappingSource: mapping ? "auto" : null,
      });

      extractionRawLines.push({
        position: index + 1,
        suggestion: mapping
          ? null
          : {
              category: suggestedCategory ?? "stock_material",
              stockItemName: line.suggestedStockItemName,
              canonicalUnit: line.suggestedCanonicalUnit,
            },
      });
    }

    await db
      .update(goodsReceipts)
      .set({
        extractionStatus: "needs_review",
        extractionRaw: {
          model: EXTRACTION_MODEL_ID,
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
      body: `AI vytěžilo ${extracted.lines.length} řádků (model: ${EXTRACTION_MODEL_ID}) — čeká na kontrolu.`,
    });

    return { ok: true };
  } catch {
    await markExtractionFailed(receiptId);
    return { ok: false, error: "Zápis vytěžených dat selhal. Zkuste to znovu." };
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
