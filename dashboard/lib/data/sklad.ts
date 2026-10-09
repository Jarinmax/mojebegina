// Security Phase 22 (Sklad 1.0 — bezpečný základ) — datová vrstva pro
// skladové lokace, dodavatele, skladové karty, ruční zadání příjemek a
// jejich atomické potvrzení/storno. Stejný princip jako dailyCalls.ts/
// leads.ts: kontrola a dotaz jsou neoddělitelné, každá exportovaná funkce
// si sama volá požadovanou skladAuth kontrolu.
//
// Potvrzení (confirmGoodsReceipt) i storno (voidGoodsReceipt) jsou JEDEN
// atomický SQL příkaz s řetězenými CTE (stejný vzor jako
// buildLogDailyCallOutcomeQuery) — neon-http driver nepodporuje
// db.transaction (viz komentář v admin.ts u vytváření organizace), takže
// vícekrokové zápisy musí buď jít přes db.batch (nezávislé statementy),
// nebo přes jediný sql příkaz s podmíněnými CTE, pokud na sobě kroky
// závisí. Oba zápisy tady závisí (pohyb/storno nesmí vzniknout, pokud se
// nepodařilo claimnout příjemku), proto CTE, ne db.batch.
import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  goodsReceiptActivity,
  goodsReceiptLines,
  goodsReceipts,
  stockItems,
  stockLocations,
  suppliers,
} from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import {
  requireConfirmAccess,
  requirePricesAndOriginalAccess,
  requireReviewAccess,
  requireUploadAccess,
  requireVoidAccess,
} from "./skladAuth";
import {
  STOCK_AFFECTING_LINE_KINDS,
  validateManualLineInput,
  validateStockItemInput,
  validateSupplierInput,
  type LineKind,
  type ManualLineInput,
  type StockItemInput,
  type SupplierInput,
} from "./skladValidation";

// --- Chyby z unikátních DB omezení přeložené na česká hlášení ----------
// Stejná konvence jako admin.ts createCustomerOrganization/updateOrganization:
// zprávu z chyby ovladače zkontrolovat na název omezení/sloupce, žádné
// předpokládání konkrétní třídy chyby neon-http driveru.
function messageIncludes(error: unknown, needle: string): boolean {
  return String(error instanceof Error ? error.message : error)
    .toLowerCase()
    .includes(needle);
}

// --- Skladové lokace -----------------------------------------------------

export type StockLocationSummary = { id: string; code: string; name: string };

export async function listStockLocations(): Promise<StockLocationSummary[]> {
  requirePricesAndOriginalAccess(await getAuthContext());
  return db
    .select({ id: stockLocations.id, code: stockLocations.code, name: stockLocations.name })
    .from(stockLocations)
    .where(eq(stockLocations.isActive, true))
    .orderBy(stockLocations.name);
}

// --- Dodavatelé ------------------------------------------------------------

export type SupplierSummary = { id: string; name: string; ico: string | null; dic: string | null };

export async function listSuppliers(): Promise<SupplierSummary[]> {
  requirePricesAndOriginalAccess(await getAuthContext());
  return db
    .select({ id: suppliers.id, name: suppliers.name, ico: suppliers.ico, dic: suppliers.dic })
    .from(suppliers)
    .where(eq(suppliers.isActive, true))
    .orderBy(suppliers.name);
}

export type CreateSupplierResult = { ok: true; supplierId: string } | { ok: false; error: string };

// Založení nového dodavatele je součást kontroly/zadání dokladu (revize
// návrhu — Střelec na tohle nemá přístup, zbylí tři ano).
export async function createSupplier(rawInput: SupplierInput): Promise<CreateSupplierResult> {
  requireReviewAccess(await getAuthContext());

  const validated = validateSupplierInput(rawInput);
  if (!validated.ok) {
    return validated;
  }
  const { name, nameNormalized, ico, dic } = validated.value;

  try {
    const [row] = await db
      .insert(suppliers)
      .values({ name, nameNormalized, ico, dic })
      .returning({ id: suppliers.id });
    return { ok: true, supplierId: row.id };
  } catch (error) {
    if (messageIncludes(error, "suppliers_ico_key")) {
      return { ok: false, error: "Dodavatel s tímto IČO už existuje." };
    }
    if (messageIncludes(error, "suppliers_name_normalized_key")) {
      return { ok: false, error: "Dodavatel s tímto názvem (bez IČO) už existuje." };
    }
    throw error;
  }
}

// --- Skladové karty ----------------------------------------------------

export type StockItemSummary = { id: string; name: string; canonicalUnit: string; kind: string };

export async function listStockItems(): Promise<StockItemSummary[]> {
  requirePricesAndOriginalAccess(await getAuthContext());
  return db
    .select({ id: stockItems.id, name: stockItems.name, canonicalUnit: stockItems.canonicalUnit, kind: stockItems.kind })
    .from(stockItems)
    .where(eq(stockItems.isActive, true))
    .orderBy(stockItems.name);
}

export type CreateStockItemResult = { ok: true; stockItemId: string } | { ok: false; error: string };

export async function createStockItem(rawInput: StockItemInput): Promise<CreateStockItemResult> {
  requireReviewAccess(await getAuthContext());

  const validated = validateStockItemInput(rawInput);
  if (!validated.ok) {
    return validated;
  }
  const [row] = await db.insert(stockItems).values(validated.value).returning({ id: stockItems.id });
  return { ok: true, stockItemId: row.id };
}

// --- Draft příjemky a ruční zadání řádků --------------------------------

export type CreateDraftReceiptInput = {
  supplierId: string;
  stockLocationId: string;
  documentNumber: string | null;
  documentDate: string | null;
  dueDate: string | null;
  paymentMethod: string | null;
};

export type CreateDraftReceiptResult = { ok: true; receiptId: string } | { ok: false; error: string };

// Založení příjemky odpovídá kroku "nahrání dokladu" i bez skutečného
// souboru (tahle etapa je bez uploadu/AI, viz zadání) — proto
// requireUploadAccess, ne requireReviewAccess: budoucí skladník
// (upload-only) smí příjemku založit, i když nesmí zadávat/kontrolovat
// řádky ani potvrzovat.
export async function createDraftGoodsReceipt(input: CreateDraftReceiptInput): Promise<CreateDraftReceiptResult> {
  const ctx = requireUploadAccess(await getAuthContext());

  const [supplier] = await db
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.id, input.supplierId))
    .limit(1);
  if (!supplier) {
    return { ok: false, error: "Dodavatel nebyl nalezen." };
  }
  const [location] = await db
    .select({ id: stockLocations.id })
    .from(stockLocations)
    .where(eq(stockLocations.id, input.stockLocationId))
    .limit(1);
  if (!location) {
    return { ok: false, error: "Skladová lokace nebyla nalezena." };
  }

  const [receipt] = await db
    .insert(goodsReceipts)
    .values({
      supplierId: input.supplierId,
      // Snapshot jména PŘESNĚ jak zní teď — pozdější přejmenování
      // dodavatele se do existujících příjemek nepromítne (revize
      // návrhu, bod 2).
      supplierNameSnapshot: supplier.name,
      stockLocationId: input.stockLocationId,
      documentNumber: input.documentNumber,
      documentDate: input.documentDate,
      dueDate: input.dueDate,
      paymentMethod: input.paymentMethod,
      status: "draft",
      extractionStatus: "not_applicable",
      createdByUserId: ctx.userId,
    })
    .returning({ id: goodsReceipts.id });

  await db.insert(goodsReceiptActivity).values({
    receiptId: receipt.id,
    actorType: "user",
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: "created",
  });

  return { ok: true, receiptId: receipt.id };
}

export type GoodsReceiptSummary = {
  id: string;
  supplierId: string;
  supplierNameSnapshot: string;
  stockLocationId: string;
  documentNumber: string | null;
  status: string;
  createdAt: Date;
};

export async function listGoodsReceipts(): Promise<GoodsReceiptSummary[]> {
  requirePricesAndOriginalAccess(await getAuthContext());
  return db
    .select({
      id: goodsReceipts.id,
      supplierId: goodsReceipts.supplierId,
      supplierNameSnapshot: goodsReceipts.supplierNameSnapshot,
      stockLocationId: goodsReceipts.stockLocationId,
      documentNumber: goodsReceipts.documentNumber,
      status: goodsReceipts.status,
      createdAt: goodsReceipts.createdAt,
    })
    .from(goodsReceipts)
    .orderBy(goodsReceipts.createdAt);
}

export type GoodsReceiptLineRow = {
  id: string;
  position: number;
  rawDescription: string;
  supplierItemCode: string | null;
  supplierAuxiliaryCode: string | null;
  normalizedQuantity: number;
  normalizedUnit: string;
  unitPriceWithoutVat: number;
  totalWithoutVatHal: number;
  vatHal: number;
  totalWithVatHal: number;
  computedVatRatePercent: number;
  lineKind: string;
  stockItemId: string | null;
};

async function fetchReceiptForMutation(
  receiptId: string
): Promise<{ id: string; status: string; supplierId: string; documentNumber: string | null; stockLocationId: string } | null> {
  const [receipt] = await db
    .select({
      id: goodsReceipts.id,
      status: goodsReceipts.status,
      supplierId: goodsReceipts.supplierId,
      documentNumber: goodsReceipts.documentNumber,
      stockLocationId: goodsReceipts.stockLocationId,
    })
    .from(goodsReceipts)
    .where(eq(goodsReceipts.id, receiptId))
    .limit(1);
  return receipt ?? null;
}

export async function listGoodsReceiptLines(receiptId: string): Promise<GoodsReceiptLineRow[]> {
  requirePricesAndOriginalAccess(await getAuthContext());
  return db
    .select({
      id: goodsReceiptLines.id,
      position: goodsReceiptLines.position,
      rawDescription: goodsReceiptLines.rawDescription,
      supplierItemCode: goodsReceiptLines.supplierItemCode,
      supplierAuxiliaryCode: goodsReceiptLines.supplierAuxiliaryCode,
      normalizedQuantity: goodsReceiptLines.normalizedQuantity,
      normalizedUnit: goodsReceiptLines.normalizedUnit,
      unitPriceWithoutVat: goodsReceiptLines.unitPriceWithoutVat,
      totalWithoutVatHal: goodsReceiptLines.totalWithoutVatHal,
      vatHal: goodsReceiptLines.vatHal,
      totalWithVatHal: goodsReceiptLines.totalWithVatHal,
      computedVatRatePercent: goodsReceiptLines.computedVatRatePercent,
      lineKind: goodsReceiptLines.lineKind,
      stockItemId: goodsReceiptLines.stockItemId,
    })
    .from(goodsReceiptLines)
    .where(eq(goodsReceiptLines.receiptId, receiptId))
    .orderBy(goodsReceiptLines.position);
}

export type AddManualLineResult = { ok: true; lineId: string } | { ok: false; error: string };

// Ruční zadání řádku — jen do DRAFT příjemky (revize návrhu, bod 5: obě
// surové hodnoty i výsledné částky se ukládají nezávisle, DPH se vždy
// DOPOČÍTÁ z částek skladValidation.computeVatRatePercent, nikdy nečte
// ze vstupu).
export async function addManualGoodsReceiptLine(
  receiptId: string,
  rawInput: ManualLineInput
): Promise<AddManualLineResult> {
  const ctx = requireReviewAccess(await getAuthContext());

  const receipt = await fetchReceiptForMutation(receiptId);
  if (!receipt) {
    return { ok: false, error: "Příjemka nebyla nalezena." };
  }
  if (receipt.status !== "draft") {
    return { ok: false, error: "Řádky lze zadávat jen do návrhu příjemky." };
  }

  const validated = validateManualLineInput(rawInput);
  if (!validated.ok) {
    return validated;
  }
  const value = validated.value;

  if (value.stockItemId) {
    const [item] = await db
      .select({ id: stockItems.id })
      .from(stockItems)
      .where(eq(stockItems.id, value.stockItemId))
      .limit(1);
    if (!item) {
      return { ok: false, error: "Skladová karta nebyla nalezena." };
    }
  }

  const existingPositions = await db
    .select({ position: goodsReceiptLines.position })
    .from(goodsReceiptLines)
    .where(eq(goodsReceiptLines.receiptId, receiptId));
  const position = existingPositions.reduce((max, row) => Math.max(max, row.position), 0) + 1;

  const [line] = await db
    .insert(goodsReceiptLines)
    .values({
      receiptId,
      position,
      rawDescription: value.rawDescription,
      supplierItemCode: value.supplierItemCode,
      supplierAuxiliaryCode: value.supplierAuxiliaryCode,
      rawPackageQuantity: value.rawPackageQuantity,
      rawUnitsPerPackage: value.rawUnitsPerPackage,
      rawUnit: value.rawUnit,
      normalizedQuantity: value.normalizedQuantity,
      normalizedUnit: value.normalizedUnit,
      unitPriceWithoutVat: value.unitPriceWithoutVat,
      totalWithoutVatHal: value.totalWithoutVatHal,
      vatHal: value.vatHal,
      totalWithVatHal: value.totalWithVatHal,
      computedVatRatePercent: value.computedVatRatePercent,
      stockItemId: value.stockItemId,
      lineKind: value.lineKind,
      mappingSource: value.stockItemId ? "manual" : null,
    })
    .returning({ id: goodsReceiptLines.id });

  await db.insert(goodsReceiptActivity).values({
    receiptId,
    actorType: "user",
    authorUserId: ctx.userId,
    authorName: ctx.name,
    kind: "line_added",
    body: value.rawDescription,
  });

  return { ok: true, lineId: line.id };
}

export type DeleteLineResult = { ok: true } | { ok: false; error: string };

export async function deleteGoodsReceiptLine(receiptId: string, lineId: string): Promise<DeleteLineResult> {
  requireReviewAccess(await getAuthContext());

  const receipt = await fetchReceiptForMutation(receiptId);
  if (!receipt) {
    return { ok: false, error: "Příjemka nebyla nalezena." };
  }
  if (receipt.status !== "draft") {
    return { ok: false, error: "Řádky lze mazat jen z návrhu příjemky." };
  }

  await db
    .delete(goodsReceiptLines)
    .where(and(eq(goodsReceiptLines.id, lineId), eq(goodsReceiptLines.receiptId, receiptId)));
  return { ok: true };
}

// --- Atomické potvrzení a skladové pohyby -------------------------------

export type ConfirmReceiptResult = { ok: true } | { ok: false; error: string };

// Jediný atomický SQL příkaz: `claimed` (UPDATE … WHERE status='draft') je
// jediný gate — INSERT pohybů i aktivity běží jen `WHERE EXISTS (SELECT 1
// FROM claimed)`, stejný dokumentovaný vzor jako
// buildLogDailyCallOutcomeQuery (Postgres provede všechny data-měnící CTE
// v jedné transakci přesně jednou). Pohyby vznikají INSERT…SELECT přímo z
// goods_receipt_lines (jeden řádek dokladu = jeden pohyb), ne smyčkou v
// JS — zvládne libovolný počet řádků v jednom příkazu. Řádky
// "non_stock_private" se do skladu nikdy nezapisují (revize návrhu, bod 1
// a schválený rozsah lineKind). Součty na hlavičce (total_*_hal) se
// dopočítají ze VŠECH řádků (i non_stock_private) — musí sedět na celý
// doklad, ne jen na skladovou část.
export async function confirmGoodsReceipt(receiptId: string): Promise<ConfirmReceiptResult> {
  const ctx = requireConfirmAccess(await getAuthContext());

  const receipt = await fetchReceiptForMutation(receiptId);
  if (!receipt) {
    return { ok: false, error: "Příjemka nebyla nalezena." };
  }
  if (receipt.status !== "draft") {
    return { ok: false, error: "Příjemka už byla potvrzena nebo zrušena." };
  }

  const lines = await db
    .select({
      id: goodsReceiptLines.id,
      lineKind: goodsReceiptLines.lineKind,
      stockItemId: goodsReceiptLines.stockItemId,
      rawDescription: goodsReceiptLines.rawDescription,
    })
    .from(goodsReceiptLines)
    .where(eq(goodsReceiptLines.receiptId, receiptId));
  if (lines.length === 0) {
    return { ok: false, error: "Příjemka nemá žádné řádky." };
  }
  const unmapped = lines.filter(
    (line) => STOCK_AFFECTING_LINE_KINDS.has(line.lineKind as LineKind) && !line.stockItemId
  );
  if (unmapped.length > 0) {
    return {
      ok: false,
      error: `Všechny skladové/zbožové řádky musí mít přiřazenou skladovou kartu (chybí u: ${unmapped
        .map((line) => line.rawDescription)
        .join(", ")}).`,
    };
  }

  // Tvrdý blok proti omylem dvojímu potvrzení stejného dokladu (revize
  // návrhu, bod 6) — stejný invariant je i na DB úrovni (partial unique
  // index goods_receipts_confirmed_document_once_key), tohle je jen
  // předběžná kontrola pro srozumitelnou hlášku místo syrové chyby
  // ovladače. Oprava jde přes storno původní a potvrzení nové příjemky
  // (voidGoodsReceipt), ne přes bypass flag tady.
  if (receipt.documentNumber) {
    const [duplicate] = await db
      .select({ id: goodsReceipts.id })
      .from(goodsReceipts)
      .where(
        and(
          eq(goodsReceipts.supplierId, receipt.supplierId),
          eq(goodsReceipts.documentNumber, receipt.documentNumber),
          eq(goodsReceipts.status, "confirmed"),
          ne(goodsReceipts.id, receiptId)
        )
      )
      .limit(1);
    if (duplicate) {
      return {
        ok: false,
        error:
          "Doklad se stejným číslem od tohoto dodavatele už je potvrzený. Pokud jde o opravu, nejdřív stornujte původní příjemku.",
      };
    }
  }

  try {
    const result = await db.execute<{ id: string }>(sql`
      WITH claimed AS (
        UPDATE goods_receipts
        SET status = 'confirmed',
            confirmed_by_user_id = ${ctx.userId},
            confirmed_at = now(),
            total_without_vat_hal = (SELECT COALESCE(SUM(total_without_vat_hal), 0) FROM goods_receipt_lines WHERE receipt_id = ${receiptId}),
            total_vat_hal = (SELECT COALESCE(SUM(vat_hal), 0) FROM goods_receipt_lines WHERE receipt_id = ${receiptId}),
            total_with_vat_hal = (SELECT COALESCE(SUM(total_with_vat_hal), 0) FROM goods_receipt_lines WHERE receipt_id = ${receiptId}),
            updated_at = now()
        WHERE id = ${receiptId} AND status = 'draft'
        RETURNING id
      ),
      movements AS (
        INSERT INTO stock_movements (stock_item_id, stock_location_id, receipt_id, receipt_line_id, direction, quantity, recorded_by_user_id)
        SELECT l.stock_item_id, ${receipt.stockLocationId}, ${receiptId}, l.id, 'in', l.normalized_quantity, ${ctx.userId}
        FROM goods_receipt_lines l
        WHERE l.receipt_id = ${receiptId}
          AND l.line_kind <> 'non_stock_private'
          AND EXISTS (SELECT 1 FROM claimed)
        RETURNING id
      )
      INSERT INTO goods_receipt_activity (receipt_id, actor_type, author_user_id, author_name, kind)
      SELECT ${receiptId}, 'user', ${ctx.userId}, ${ctx.name}, 'confirmed'
      WHERE EXISTS (SELECT 1 FROM claimed)
      RETURNING id
    `);

    if (result.rows.length === 0) {
      return { ok: false, error: "Příjemku se nepodařilo potvrdit — mezitím ji už někdo změnil." };
    }
    return { ok: true };
  } catch (error) {
    if (messageIncludes(error, "goods_receipts_confirmed_document_once_key")) {
      return {
        ok: false,
        error:
          "Doklad se stejným číslem od tohoto dodavatele už je potvrzený. Pokud jde o opravu, nejdřív stornujte původní příjemku.",
      };
    }
    throw error;
  }
}

// --- Atomické storno -----------------------------------------------------

export type VoidReceiptResult = { ok: true } | { ok: false; error: string };

// Storno vytváří NOVÉ, opačné pohyby (corrects_movement_id → originál) —
// NIKDY update/delete historických pohybů (revize návrhu, bod 7). Dvojí
// storno stejného pohybu je vyloučeno jak tady (`NOT EXISTS` v INSERT…
// SELECT), tak na DB úrovni (stock_movements_corrects_once_key).
export async function voidGoodsReceipt(receiptId: string, reason: string): Promise<VoidReceiptResult> {
  const ctx = requireVoidAccess(await getAuthContext());

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { ok: false, error: "Důvod storna je povinný." };
  }

  const receipt = await fetchReceiptForMutation(receiptId);
  if (!receipt) {
    return { ok: false, error: "Příjemka nebyla nalezena." };
  }
  if (receipt.status !== "confirmed") {
    return { ok: false, error: "Stornovat lze jen potvrzenou příjemku." };
  }

  const result = await db.execute<{ id: string }>(sql`
    WITH claimed AS (
      UPDATE goods_receipts
      SET status = 'voided',
          voided_by_user_id = ${ctx.userId},
          voided_at = now(),
          void_reason = ${trimmedReason},
          updated_at = now()
      WHERE id = ${receiptId} AND status = 'confirmed'
      RETURNING id
    ),
    corrections AS (
      INSERT INTO stock_movements (stock_item_id, stock_location_id, receipt_id, receipt_line_id, direction, quantity, recorded_by_user_id, corrects_movement_id, reason)
      SELECT m.stock_item_id, m.stock_location_id, m.receipt_id, m.receipt_line_id,
             CASE WHEN m.direction = 'in' THEN 'out' ELSE 'in' END,
             m.quantity, ${ctx.userId}, m.id, ${trimmedReason}
      FROM stock_movements m
      WHERE m.receipt_id = ${receiptId}
        AND m.corrects_movement_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM stock_movements c WHERE c.corrects_movement_id = m.id)
        AND EXISTS (SELECT 1 FROM claimed)
      RETURNING id
    )
    INSERT INTO goods_receipt_activity (receipt_id, actor_type, author_user_id, author_name, kind, body)
    SELECT ${receiptId}, 'user', ${ctx.userId}, ${ctx.name}, 'voided', ${trimmedReason}
    WHERE EXISTS (SELECT 1 FROM claimed)
    RETURNING id
  `);

  if (result.rows.length === 0) {
    return { ok: false, error: "Příjemku se nepodařilo stornovat — mezitím ji už někdo změnil." };
  }
  return { ok: true };
}
