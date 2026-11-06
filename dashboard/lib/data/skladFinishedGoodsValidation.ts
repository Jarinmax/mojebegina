// Sklad 1.1 (hotové výrobky z výroby) — čistá validace, bez "server-only",
// stejný princip jako skladValidation.ts: testovatelné bez databáze,
// kontrola a dotaz se skládají až v skladFinishedGoods.ts.

// Formát šarže: "L-20261106-DYN-01" — stejný regex jako DB check
// stock_batches_code_format (velká písmena, číslice, pomlčky). Appka ho
// NEVYMÝŠLÍ ani neupravuje (žádné auto-uppercase) — kdo zadá jiný formát,
// dostane jasnou chybu, ne tiše přepsané označení.
const BATCH_CODE_RE = /^[A-Z0-9][A-Z0-9-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidBatchCode(value: string): boolean {
  return BATCH_CODE_RE.test(value) && value.length <= 64;
}

function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export type RecordProductionBatchInput = {
  stockItemId: string;
  quantity: number;
  batchCode: string;
  producedAt: string; // YYYY-MM-DD
  bestBeforeAt: string; // YYYY-MM-DD
  stockLocationId: string;
  responsibleUserId: string;
  note: string;
};

export type ValidatedRecordProductionBatch = {
  stockItemId: string;
  quantity: number;
  batchCode: string;
  producedAt: string;
  bestBeforeAt: string;
  stockLocationId: string;
  responsibleUserId: string;
  note: string; // povinná (zadání, bod 2) — na rozdíl od ostatních akcí níž
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function validateRecordProductionBatchInput(
  input: RecordProductionBatchInput
): { ok: true; value: ValidatedRecordProductionBatch } | { ok: false; error: string } {
  if (!isUuid(input.stockItemId)) {
    return { ok: false, error: "Vyberte výrobek." };
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: "Počet kusů musí být kladné číslo." };
  }
  const batchCode = input.batchCode.trim();
  if (!batchCode) {
    return { ok: false, error: "Označení šarže je povinné." };
  }
  if (!isValidBatchCode(batchCode)) {
    return {
      ok: false,
      error: "Označení šarže smí obsahovat jen velká písmena, číslice a pomlčky (např. L-20261106-DYN-01).",
    };
  }
  if (!isValidDateString(input.producedAt)) {
    return { ok: false, error: "Zadejte platné datum výroby." };
  }
  if (!isValidDateString(input.bestBeforeAt)) {
    return { ok: false, error: "Zadejte platné datum minimální trvanlivosti nebo spotřeby." };
  }
  if (input.bestBeforeAt < input.producedAt) {
    return { ok: false, error: "Datum minimální trvanlivosti/spotřeby nemůže být před datem výroby." };
  }
  if (!isUuid(input.stockLocationId)) {
    return { ok: false, error: "Vyberte skladovou lokaci." };
  }
  if (!isUuid(input.responsibleUserId)) {
    return { ok: false, error: "Vyberte odpovědnou osobu." };
  }
  // Poznámka je tu POVINNÁ (zadání výslovně, bod 2) — na rozdíl od rezervace/
  // výdeje/korekce, kde je nepovinná. Příjem výroby je jediný vstupní bod
  // dat o šarži, který appka pak nabízí dál (výdej, korekce) — proto zápis
  // kontextu (např. "ochutnávka na veletrhu", "menší var kvůli dešti u
  // dýní") hned u zdroje, ne až zpětně.
  const note = input.note.trim();
  if (!note) {
    return { ok: false, error: "Poznámka je povinná." };
  }
  if (note.length > 2000) {
    return { ok: false, error: "Poznámka je příliš dlouhá (nejvýš 2000 znaků)." };
  }
  return {
    ok: true,
    value: {
      stockItemId: input.stockItemId,
      quantity: input.quantity,
      batchCode,
      producedAt: input.producedAt,
      bestBeforeAt: input.bestBeforeAt,
      stockLocationId: input.stockLocationId,
      responsibleUserId: input.responsibleUserId,
      note,
    },
  };
}

// `orderNumber`, ne `orderId` — stejně jako lidé i ChatGPT mluví o
// "objednávce 5228", ne o jejím UUID (orders.order_number, viditelné
// zákazníkovi i v appce). Data vrstva (skladFinishedGoods.ts) ho sama
// přeloží na orders.id.
export type ReserveStockForOrderInput = {
  stockItemId: string;
  stockLocationId: string;
  orderNumber: number;
  quantity: number;
  batchId: string | null;
  note: string;
};

export type ValidatedReserveStockForOrder = {
  stockItemId: string;
  stockLocationId: string;
  orderNumber: number;
  quantity: number;
  batchId: string | null;
  note: string | null;
};

export function validateReserveStockForOrderInput(
  input: ReserveStockForOrderInput
): { ok: true; value: ValidatedReserveStockForOrder } | { ok: false; error: string } {
  if (!isUuid(input.stockItemId)) {
    return { ok: false, error: "Vyberte výrobek." };
  }
  if (!isUuid(input.stockLocationId)) {
    return { ok: false, error: "Vyberte skladovou lokaci." };
  }
  if (!Number.isInteger(input.orderNumber) || input.orderNumber <= 0) {
    return { ok: false, error: "Zadejte platné číslo objednávky." };
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: "Počet kusů k rezervaci musí být kladné číslo." };
  }
  if (input.batchId !== null && !isUuid(input.batchId)) {
    return { ok: false, error: "Neplatná šarže." };
  }
  const note = input.note.trim();
  if (note.length > 2000) {
    return { ok: false, error: "Poznámka je příliš dlouhá (nejvýš 2000 znaků)." };
  }
  return {
    ok: true,
    value: {
      stockItemId: input.stockItemId,
      stockLocationId: input.stockLocationId,
      orderNumber: input.orderNumber,
      quantity: input.quantity,
      batchId: input.batchId,
      note: note || null,
    },
  };
}

export type RecordStockDispatchInput = { reservationId: string; note: string };
export type ValidatedRecordStockDispatch = { reservationId: string; note: string | null };

export function validateRecordStockDispatchInput(
  input: RecordStockDispatchInput
): { ok: true; value: ValidatedRecordStockDispatch } | { ok: false; error: string } {
  if (!isUuid(input.reservationId)) {
    return { ok: false, error: "Vyberte rezervaci k výdeji." };
  }
  const note = input.note.trim();
  if (note.length > 2000) {
    return { ok: false, error: "Poznámka je příliš dlouhá (nejvýš 2000 znaků)." };
  }
  return { ok: true, value: { reservationId: input.reservationId, note: note || null } };
}

export type AdjustStockAfterInventoryInput = {
  stockItemId: string;
  stockLocationId: string;
  countedQuantity: number;
  reason: string;
  batchId: string | null;
};
export type ValidatedAdjustStockAfterInventory = {
  stockItemId: string;
  stockLocationId: string;
  countedQuantity: number;
  reason: string;
  batchId: string | null;
};

export function validateAdjustStockAfterInventoryInput(
  input: AdjustStockAfterInventoryInput
): { ok: true; value: ValidatedAdjustStockAfterInventory } | { ok: false; error: string } {
  if (!isUuid(input.stockItemId)) {
    return { ok: false, error: "Vyberte výrobek." };
  }
  if (!isUuid(input.stockLocationId)) {
    return { ok: false, error: "Vyberte skladovou lokaci." };
  }
  if (!Number.isFinite(input.countedQuantity) || input.countedQuantity < 0) {
    return { ok: false, error: "Napočítané množství musí být nula nebo kladné číslo." };
  }
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, error: "Důvod inventurní korekce je povinný." };
  }
  if (reason.length > 500) {
    return { ok: false, error: "Důvod je příliš dlouhý (nejvýš 500 znaků)." };
  }
  if (input.batchId !== null && !isUuid(input.batchId)) {
    return { ok: false, error: "Neplatná šarže." };
  }
  return {
    ok: true,
    value: {
      stockItemId: input.stockItemId,
      stockLocationId: input.stockLocationId,
      countedQuantity: input.countedQuantity,
      reason,
      batchId: input.batchId,
    },
  };
}
