// Sklad 1.1 — hotové výrobky z výroby: příjem šarže (production_in),
// rezervace pro objednávku, výdej (dispatch_out) a inventurní korekce.
// Stejný princip jako sklad.ts: kontrola a dotaz jsou neoddělitelné,
// každá exportovaná funkce si sama volá požadovanou skladAuth kontrolu.
//
// Oprávnění (zadání výslovně, stejná matice jako Sklad 1.0):
//   - příjem výroby = requireUploadAccess (Viner, Königsbergová, Blahout —
//     kdo fyzicky stojí u výroby a zapisuje);
//   - rezervace a výdej = requireConfirmAccess (stejná trojice, potvrzující
//     krok jako potvrzení příjemky);
//   - inventurní korekce = requireVoidAccess (jen Viner a Königsbergová —
//     stejná citlivost jako storno, může maskovat manko);
//   - čtení stavu = requirePricesAndOriginalAccess (+ Střelec, jen čtení).
// Žádná nová role se nevymýšlí.
//
// Append-only: KAŽDÁ změna fyzického stavu je nový řádek stock_movements
// (nikdy UPDATE existujícího), přesně jako u příjemek v Sklad 1.0. Stejně
// tak rezervace se nikdy nemaže — jen přejde do fulfilled/released se
// záznamem KDY/KDO/PROČ (append-only duch, ne mazání).
import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, stockBatches, stockItemAvailability, stockItems, stockLocations, stockReservations } from "@/lib/db/schema";
import { getAuthContext } from "./authContext";
import { requireConfirmAccess, requirePricesAndOriginalAccess, requireUploadAccess, requireVoidAccess } from "./skladAuth";
import { getUserProfile, getUserProfiles } from "./userProfiles";
import {
  validateAdjustStockAfterInventoryInput,
  validateRecordProductionBatchInput,
  validateRecordStockDispatchInput,
  validateReserveStockForOrderInput,
  type AdjustStockAfterInventoryInput,
  type RecordProductionBatchInput,
  type RecordStockDispatchInput,
  type ReserveStockForOrderInput,
} from "./skladFinishedGoodsValidation";

// Stejný vzor jako sklad.ts (soubor si drží vlastní privátní kopii,
// cross-import by vytvořil zbytečnou vazbu mezi dvěma jinak nezávislými
// moduly — drizzle-orm@0.45 balí chybu ovladače do DrizzleQueryError,
// skutečná hláška (název omezení) žije až v .cause).
function messageIncludes(error: unknown, needle: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error) {
      if (current.message.toLowerCase().includes(needle)) return true;
      current = (current as Error & { cause?: unknown }).cause;
    } else {
      return false;
    }
  }
  return false;
}

// --- Čtení -------------------------------------------------------------

export type StockAvailabilityRow = {
  stockItemId: string;
  stockItemName: string;
  stockItemKind: string;
  canonicalUnit: string;
  stockLocationId: string;
  stockLocationName: string;
  physicalQuantity: number;
  reservedQuantity: number;
  freeQuantity: number;
};

/** list_stock (MCP) i přehledová stránka — fyzický/rezervovaný/volný stav za kartu×lokaci. */
export async function listStock(): Promise<StockAvailabilityRow[]> {
  requirePricesAndOriginalAccess(await getAuthContext());
  const rows = await db
    .select({
      stockItemId: stockItems.id,
      stockItemName: stockItems.name,
      stockItemKind: stockItems.kind,
      canonicalUnit: stockItems.canonicalUnit,
      stockLocationId: stockLocations.id,
      stockLocationName: stockLocations.name,
      physicalQuantity: stockItemAvailability.physicalQuantity,
      reservedQuantity: stockItemAvailability.reservedQuantity,
      freeQuantity: stockItemAvailability.freeQuantity,
    })
    .from(stockItemAvailability)
    .innerJoin(stockItems, eq(stockItems.id, stockItemAvailability.stockItemId))
    .innerJoin(stockLocations, eq(stockLocations.id, stockItemAvailability.stockLocationId))
    .orderBy(stockItems.name, stockLocations.name);
  return rows;
}

export type ResponsiblePersonOption = { userId: string; name: string | null; email: string };

/** Nabídka "odpovědná osoba" na formuláři příjmu výroby — stejná šířka jako
 * requireUploadAccess (kdokoli, kdo smí výrobu zapsat, může být i tím, za koho se zapisuje). */
const UPLOAD_ROLE_USER_IDS = [
  "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c", // Jaroslav Viner
  "f9f93f03-92b0-4724-becd-c0a3576b5275", // Lucie Königsbergová
  "06240ac4-c050-47ea-998c-6c81389edf9f", // Jaroslav Blahout
];

export async function listResponsiblePersonOptions(): Promise<ResponsiblePersonOption[]> {
  requireUploadAccess(await getAuthContext());
  const profiles = await getUserProfiles(UPLOAD_ROLE_USER_IDS);
  return UPLOAD_ROLE_USER_IDS.map((userId) => {
    const profile = profiles.get(userId);
    return profile ? { userId, name: profile.name, email: profile.email } : null;
  }).filter((v): v is ResponsiblePersonOption => v !== null);
}

export type StockBatchSummary = { id: string; batchCode: string; producedAt: string; bestBeforeAt: string };

export async function listStockBatchesForItem(stockItemId: string): Promise<StockBatchSummary[]> {
  requirePricesAndOriginalAccess(await getAuthContext());
  return db
    .select({ id: stockBatches.id, batchCode: stockBatches.batchCode, producedAt: stockBatches.producedAt, bestBeforeAt: stockBatches.bestBeforeAt })
    .from(stockBatches)
    .where(eq(stockBatches.stockItemId, stockItemId))
    .orderBy(stockBatches.producedAt);
}

// --- Příjem výroby -------------------------------------------------------

export type RecordProductionBatchResult =
  | { ok: true; batchId: string; movementId: string; batchCode: string }
  | { ok: false; error: string };

/** record_production_batch (MCP) i mobilní formulář "Dokončit výrobu / Přijmout výrobky".
 * Append-only production_in pohyb + nová šarže v JEDNÉ atomické transakci. */
export async function recordProductionBatch(rawInput: RecordProductionBatchInput): Promise<RecordProductionBatchResult> {
  const ctx = requireUploadAccess(await getAuthContext());
  const validated = validateRecordProductionBatchInput(rawInput);
  if (!validated.ok) return { ok: false, error: validated.error };
  const input = validated.value;

  const [item] = await db.select({ id: stockItems.id, isActive: stockItems.isActive }).from(stockItems).where(eq(stockItems.id, input.stockItemId)).limit(1);
  if (!item || !item.isActive) return { ok: false, error: "Výrobek nebyl nalezen." };
  const [location] = await db.select({ id: stockLocations.id }).from(stockLocations).where(eq(stockLocations.id, input.stockLocationId)).limit(1);
  if (!location) return { ok: false, error: "Skladová lokace nebyla nalezena." };
  const responsible = await getUserProfile(input.responsibleUserId);
  if (!responsible) return { ok: false, error: "Odpovědná osoba nebyla nalezena." };

  try {
    const result = await db.execute<{ batch_id: string; movement_id: string }>(sql`
      WITH new_batch AS (
        INSERT INTO stock_batches (stock_item_id, batch_code, produced_at, best_before_at, note, created_by_user_id)
        VALUES (${input.stockItemId}, ${input.batchCode}, ${input.producedAt}, ${input.bestBeforeAt}, ${input.note}, ${ctx.userId})
        RETURNING id
      ),
      movement AS (
        INSERT INTO stock_movements (stock_item_id, stock_location_id, kind, batch_id, direction, quantity, recorded_by_user_id, responsible_user_id, note)
        SELECT ${input.stockItemId}, ${input.stockLocationId}, 'production_in', new_batch.id, 'in', ${input.quantity}, ${ctx.userId}, ${input.responsibleUserId}, ${input.note}
        FROM new_batch
        RETURNING id, batch_id
      )
      SELECT new_batch.id AS batch_id, movement.id AS movement_id FROM new_batch JOIN movement ON true
    `);
    const row = result.rows[0];
    if (!row) return { ok: false, error: "Příjem výroby se nepodařilo zapsat." };
    return { ok: true, batchId: row.batch_id, movementId: row.movement_id, batchCode: input.batchCode };
  } catch (error) {
    if (messageIncludes(error, "stock_batches_code_key")) {
      return { ok: false, error: `Šarže „${input.batchCode}“ už existuje — zvolte jiné označení.` };
    }
    throw error;
  }
}

// --- Rezervace pro objednávku ---------------------------------------------

export type ReserveStockForOrderResult =
  | { ok: true; reservationId: string; freeBeforeReservation: number }
  | { ok: false; error: string };

/** reserve_stock_for_order (MCP) — nic nemění fyzický zůstatek, jen sníží VOLNÝ
 * stav (stock_item_availability.free_quantity). Advisory lock + kontrola volného
 * stavu a INSERT v JEDNÉ atomické transakci (žádné dvě souběžné rezervace
 * nemůžou přetáhnout stejnou volnou jednotku — viz test na souběh). */
export async function reserveStockForOrder(rawInput: ReserveStockForOrderInput): Promise<ReserveStockForOrderResult> {
  const ctx = requireConfirmAccess(await getAuthContext());
  const validated = validateReserveStockForOrderInput(rawInput);
  if (!validated.ok) return { ok: false, error: validated.error };
  const input = validated.value;

  const [item] = await db.select({ id: stockItems.id }).from(stockItems).where(eq(stockItems.id, input.stockItemId)).limit(1);
  if (!item) return { ok: false, error: "Výrobek nebyl nalezen." };
  const [location] = await db.select({ id: stockLocations.id }).from(stockLocations).where(eq(stockLocations.id, input.stockLocationId)).limit(1);
  if (!location) return { ok: false, error: "Skladová lokace nebyla nalezena." };
  const [order] = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, input.orderNumber)).limit(1);
  if (!order) return { ok: false, error: `Objednávka č. ${input.orderNumber} nebyla nalezena.` };
  if (input.batchId) {
    const [batch] = await db.select({ id: stockBatches.id, stockItemId: stockBatches.stockItemId }).from(stockBatches).where(eq(stockBatches.id, input.batchId)).limit(1);
    if (!batch || batch.stockItemId !== input.stockItemId) {
      return { ok: false, error: "Šarže nebyla nalezena nebo nepatří k vybranému výrobku." };
    }
  }

  const result = await db.execute<{ reservation_id: string | null; free_before: number }>(sql`
    WITH locked AS (
      -- Advisory lock za (stock_item_id, stock_location_id), stejný vzor jako
      -- goods_receipt_document_pages_unique_active_sha256 (0028_sklad_1_0_zaklad.sql),
      -- jen jiný vstup do hashtextextended. Drží se do konce transakce (xact).
      SELECT pg_advisory_xact_lock(hashtextextended(${input.stockItemId}::text || ':' || ${input.stockLocationId}::text, 0))
    ),
    avail AS (
      SELECT COALESCE(
        (SELECT free_quantity FROM stock_item_availability WHERE stock_item_id = ${input.stockItemId} AND stock_location_id = ${input.stockLocationId}),
        0
      ) AS free
      FROM locked
    ),
    ins AS (
      INSERT INTO stock_reservations (stock_item_id, stock_location_id, batch_id, order_id, quantity, created_by_user_id, note)
      SELECT ${input.stockItemId}, ${input.stockLocationId}, ${input.batchId}, ${order.id}, ${input.quantity}, ${ctx.userId}, ${input.note}
      FROM avail WHERE avail.free >= ${input.quantity}
      RETURNING id
    )
    SELECT (SELECT id FROM ins) AS reservation_id, avail.free AS free_before FROM avail
  `);
  const row = result.rows[0];
  if (!row || row.reservation_id === null) {
    const free = row?.free_before ?? 0;
    return { ok: false, error: `Nedostatek volné zásoby — k dispozici je ${free} ks, požadováno ${input.quantity} ks.` };
  }
  return { ok: true, reservationId: row.reservation_id, freeBeforeReservation: Number(row.free_before) };
}

export type ReleaseReservationResult = { ok: true } | { ok: false; error: string };

/** Zrušení rezervace BEZ výdeje (např. zrušená objednávka) — append-only:
 * řádek zůstává, jen přejde do 'released' se záznamem KDY/KDO/PROČ. Zatím
 * jen pro webové UI (není v požadovaných pěti MCP nástrojích). */
export async function releaseReservation(reservationId: string, reason: string): Promise<ReleaseReservationResult> {
  const ctx = requireConfirmAccess(await getAuthContext());
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { ok: false, error: "Důvod zrušení rezervace je povinný." };

  const result = await db.execute<{ id: string }>(sql`
    UPDATE stock_reservations
    SET status = 'released', released_at = now(), released_by_user_id = ${ctx.userId}, release_reason = ${trimmedReason}
    WHERE id = ${reservationId} AND status = 'active'
    RETURNING id
  `);
  if (result.rows.length === 0) {
    return { ok: false, error: "Rezervaci nelze zrušit (nenalezena, nebo už byla vyřízena/zrušena)." };
  }
  return { ok: true };
}

// --- Výdej ---------------------------------------------------------------

export type RecordStockDispatchResult =
  | { ok: true; movementId: string }
  | { ok: false; error: string };

/** record_stock_dispatch (MCP) — po potvrzeném výdeji/závozu: append-only
 * dispatch_out pohyb a ATOMICKY uvolní (fulfilled) odpovídající rezervaci.
 * Vyžaduje existující AKTIVNÍ rezervaci (žádný výdej bez rezervace — revize
 * zadání, bod 6: "po potvrzeném výdeji NEBO závozu ... a uvolni rezervaci"). */
export async function recordStockDispatch(rawInput: RecordStockDispatchInput): Promise<RecordStockDispatchResult> {
  const ctx = requireConfirmAccess(await getAuthContext());
  const validated = validateRecordStockDispatchInput(rawInput);
  if (!validated.ok) return { ok: false, error: validated.error };
  const input = validated.value;

  const [reservation] = await db
    .select({ id: stockReservations.id, status: stockReservations.status })
    .from(stockReservations)
    .where(eq(stockReservations.id, input.reservationId))
    .limit(1);
  if (!reservation) return { ok: false, error: "Rezervace nebyla nalezena." };
  if (reservation.status !== "active") {
    return { ok: false, error: reservation.status === "fulfilled" ? "Rezervace už byla vydána." : "Rezervace byla zrušena." };
  }

  const result = await db.execute<{ movement_id: string | null }>(sql`
    WITH locked AS (
      SELECT pg_advisory_xact_lock(hashtextextended(r.stock_item_id::text || ':' || r.stock_location_id::text, 0))
      FROM stock_reservations r WHERE r.id = ${input.reservationId}
    ),
    reservation AS (
      SELECT * FROM stock_reservations WHERE id = ${input.reservationId} AND status = 'active'
    ),
    movement AS (
      INSERT INTO stock_movements (stock_item_id, stock_location_id, kind, batch_id, direction, quantity, recorded_by_user_id, note)
      SELECT res.stock_item_id, res.stock_location_id, 'dispatch_out', res.batch_id, 'out', res.quantity, ${ctx.userId}, ${input.note}
      FROM reservation res JOIN locked ON true
      RETURNING id
    ),
    updated AS (
      UPDATE stock_reservations
      SET status = 'fulfilled', fulfilled_at = now(), fulfilled_by_movement_id = (SELECT id FROM movement)
      WHERE id = ${input.reservationId} AND status = 'active' AND EXISTS (SELECT 1 FROM movement)
      RETURNING id
    )
    SELECT (SELECT id FROM movement) AS movement_id
  `);
  const movementId = result.rows[0]?.movement_id ?? null;
  if (!movementId) {
    return { ok: false, error: "Výdej se nepodařilo zapsat (rezervace mezitím změnila stav)." };
  }
  return { ok: true, movementId };
}

// --- Inventurní korekce ----------------------------------------------------

export type AdjustStockAfterInventoryResult =
  | { ok: true; movementId: string; direction: "in" | "out"; quantity: number }
  | { ok: false; error: string };

/** adjust_stock_after_inventory (MCP) — append-only: NIKDY nepřepisuje
 * zůstatek přímo, vždy jen přidá korekční pohyb s povinným důvodem (revize
 * zadání, bod 7). Nejcitlivější akce (requireVoidAccess — stejná úroveň
 * jako storno příjemky, může maskovat manko). */
export async function adjustStockAfterInventory(rawInput: AdjustStockAfterInventoryInput): Promise<AdjustStockAfterInventoryResult> {
  const ctx = requireVoidAccess(await getAuthContext());
  const validated = validateAdjustStockAfterInventoryInput(rawInput);
  if (!validated.ok) return { ok: false, error: validated.error };
  const input = validated.value;

  const [item] = await db.select({ id: stockItems.id }).from(stockItems).where(eq(stockItems.id, input.stockItemId)).limit(1);
  if (!item) return { ok: false, error: "Výrobek nebyl nalezen." };
  const [location] = await db.select({ id: stockLocations.id }).from(stockLocations).where(eq(stockLocations.id, input.stockLocationId)).limit(1);
  if (!location) return { ok: false, error: "Skladová lokace nebyla nalezena." };
  if (input.batchId) {
    const [batch] = await db.select({ id: stockBatches.id, stockItemId: stockBatches.stockItemId }).from(stockBatches).where(eq(stockBatches.id, input.batchId)).limit(1);
    if (!batch || batch.stockItemId !== input.stockItemId) {
      return { ok: false, error: "Šarže nebyla nalezena nebo nepatří k vybranému výrobku." };
    }
  }

  const result = await db.execute<{ id: string; direction: "in" | "out"; quantity: number }>(sql`
    WITH locked AS (
      SELECT pg_advisory_xact_lock(hashtextextended(${input.stockItemId}::text || ':' || ${input.stockLocationId}::text, 0))
    ),
    current_balance AS (
      SELECT COALESCE(
        (SELECT current_quantity FROM stock_item_balances WHERE stock_item_id = ${input.stockItemId} AND stock_location_id = ${input.stockLocationId}),
        0
      ) AS physical
      FROM locked
    ),
    movement AS (
      INSERT INTO stock_movements (stock_item_id, stock_location_id, kind, batch_id, direction, quantity, recorded_by_user_id, reason)
      SELECT
        ${input.stockItemId}, ${input.stockLocationId}, 'inventory_correction', ${input.batchId},
        CASE WHEN ${input.countedQuantity} >= physical THEN 'in' ELSE 'out' END,
        ABS(${input.countedQuantity} - physical),
        ${ctx.userId}, ${input.reason}
      FROM current_balance
      WHERE physical <> ${input.countedQuantity}
      RETURNING id, direction, quantity
    )
    SELECT id, direction, quantity FROM movement
  `);
  const row = result.rows[0];
  if (!row) {
    return { ok: false, error: "Napočítané množství odpovídá zůstatku v appce — žádná korekce není potřeba." };
  }
  return { ok: true, movementId: row.id, direction: row.direction, quantity: Number(row.quantity) };
}
