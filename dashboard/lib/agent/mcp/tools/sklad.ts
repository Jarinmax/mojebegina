// Sklad 1.1 (hotové výrobky) — nástroje pro ChatGPT. Každý jen přemostí na
// EXISTUJÍCÍ funkci datové vrstvy (lib/data/skladFinishedGoods.ts), která
// si sama ověří oprávnění přes getAuthContext() → identita asistenta (viz
// tools.ts hlavička). idempotency_key, limit zápisů za hodinu a auditní
// záznam (vč. "(přes ChatGPT)" u authorName) řeší server.ts centrálně pro
// KAŽDÝ nástroj — tenhle soubor se tím vůbec nezabývá.
//
// Samostatný soubor, žádný import z tools/orders.ts ani tools/invoicing.ts
// (jiná doména, jiný rozsah — Sklad 1.1 se objednávek a faktur jen DOTÝKÁ
// přes orders.order_number, nikdy je neupravuje).
import "server-only";
import {
  adjustStockAfterInventory,
  listStock,
  recordProductionBatch,
  recordStockDispatch,
  reserveStockForOrder,
} from "@/lib/data/skladFinishedGoods";
import { ArgError, optionalString, requiredString, requiredUuid } from "../args";
import { defineTool, type AgentTool, type ToolOutcome } from "../define";

function requiredPositiveNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ArgError(`Argument ${key} musí být kladné číslo.`);
  }
  return value;
}

function requiredPositiveInteger(args: Record<string, unknown>, key: string): number {
  const value = requiredPositiveNumber(args, key);
  if (!Number.isInteger(value)) {
    throw new ArgError(`Argument ${key} musí být celé číslo.`);
  }
  return value;
}

function requiredDateString(args: Record<string, unknown>, key: string): string {
  const value = requiredString(args, key, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ArgError(`Argument ${key} musí být datum ve formátu RRRR-MM-DD.`);
  }
  return value;
}

function optionalUuid(args: Record<string, unknown>, key: string): string | null {
  const value = optionalString(args, key, 36);
  if (value === null) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ArgError(`Argument ${key} musí být id (UUID).`);
  }
  return value.toLowerCase();
}

const stockUrl = (issuer: string) => `${issuer}/rizeni-firmy/sklad/stav`;

export const SKLAD_TOOLS: AgentTool[] = [
  defineTool({
    name: "list_stock",
    title: "Stav skladu (hotové výrobky)",
    description:
      "Fyzický stav, rezervováno a volný stav za každou skladovou kartu a lokaci (zůstatek = append-only pohyby, rezervace nikdy fyzický zůstatek nemění).",
    write: false,
    properties: {},
    required: [],
    parse: () => null,
    execute: async (_parsed, issuer) => {
      const rows = await listStock();
      return {
        ok: true,
        summary: { items: rows.length },
        data: {
          stock: rows.map((r) => ({
            stockItemId: r.stockItemId,
            name: r.stockItemName,
            kind: r.stockItemKind,
            unit: r.canonicalUnit,
            stockLocationId: r.stockLocationId,
            location: r.stockLocationName,
            physicalQuantity: r.physicalQuantity,
            reservedQuantity: r.reservedQuantity,
            freeQuantity: r.freeQuantity,
          })),
          url: stockUrl(issuer),
        },
      };
    },
  }),

  defineTool({
    name: "record_production_batch",
    title: "Zapsat příjem výroby (nová šarže)",
    description:
      "ZÁPIS — append-only pohyb production_in: založí novou šarži hotového výrobku a zvýší jeho fyzický stav. Nikdy nepřepisuje ani neslučuje s jinou šarží. " +
      "batch_code musí být jedinečný (např. L-20261106-DYN-01, velká písmena/číslice/pomlčky). Poznámka je POVINNÁ.",
    write: true,
    properties: {
      stock_item_id: { type: "string", description: "id skladové karty výrobku (UUID) z list_stock." },
      quantity: { type: "number", description: "Počet kusů (ve skladové jednotce karty, např. 1 ks = 1 Bag-in-Box 3 l)." },
      batch_code: { type: "string", description: "Jedinečné označení šarže, např. L-20261106-DYN-01." },
      produced_at: { type: "string", description: "Datum výroby RRRR-MM-DD." },
      best_before_at: { type: "string", description: "Datum minimální trvanlivosti nebo spotřeby RRRR-MM-DD." },
      stock_location_id: { type: "string", description: "id skladové lokace (UUID)." },
      responsible_user_id: { type: "string", description: "id odpovědné osoby (UUID) — kdo za výrobu/dávku odpovídá." },
      note: { type: "string", description: "Poznámka k dávce (povinné, max. 2000 znaků)." },
    },
    required: ["stock_item_id", "quantity", "batch_code", "produced_at", "best_before_at", "stock_location_id", "responsible_user_id", "note"],
    parse: (args) => ({
      stockItemId: requiredUuid(args, "stock_item_id"),
      quantity: requiredPositiveNumber(args, "quantity"),
      batchCode: requiredString(args, "batch_code", 64),
      producedAt: requiredDateString(args, "produced_at"),
      bestBeforeAt: requiredDateString(args, "best_before_at"),
      stockLocationId: requiredUuid(args, "stock_location_id"),
      responsibleUserId: requiredUuid(args, "responsible_user_id"),
      note: requiredString(args, "note", 2000),
    }),
    execute: async (input, issuer) => {
      const result = await recordProductionBatch(input);
      return result.ok
        ? { ok: true, data: { batchId: result.batchId, movementId: result.movementId, batchCode: result.batchCode, url: stockUrl(issuer) } }
        : result;
    },
  }),

  defineTool({
    name: "reserve_stock_for_order",
    title: "Rezervovat zásobu pro objednávku",
    description:
      "ZÁPIS — rezervuje zásobu pro konkrétní objednávku. NEMĚNÍ fyzický zůstatek, jen sníží volný stav. Selže, pokud není dost volné zásoby (vrátí aktuální volný stav v chybě). " +
      "order_number je číslo objednávky v MojeBegina (ne UUID).",
    write: true,
    properties: {
      stock_item_id: { type: "string", description: "id skladové karty výrobku (UUID)." },
      stock_location_id: { type: "string", description: "id skladové lokace (UUID)." },
      order_number: { type: "number", description: "Číslo objednávky v MojeBegina (ne UUID)." },
      quantity: { type: "number", description: "Počet kusů k rezervaci." },
      batch_id: { type: "string", description: "Volitelné: id konkrétní šarže (UUID), ze které se má rezervovat." },
      note: { type: "string", description: "Volitelná poznámka (max. 2000 znaků)." },
    },
    required: ["stock_item_id", "stock_location_id", "order_number", "quantity"],
    parse: (args) => ({
      stockItemId: requiredUuid(args, "stock_item_id"),
      stockLocationId: requiredUuid(args, "stock_location_id"),
      orderNumber: requiredPositiveInteger(args, "order_number"),
      quantity: requiredPositiveNumber(args, "quantity"),
      batchId: optionalUuid(args, "batch_id"),
      note: optionalString(args, "note", 2000) ?? "",
    }),
    execute: async (input, issuer) => {
      const result = await reserveStockForOrder(input);
      return result.ok
        ? { ok: true, data: { reservationId: result.reservationId, freeBeforeReservation: result.freeBeforeReservation, url: stockUrl(issuer) } }
        : result;
    },
  }),

  defineTool({
    name: "record_stock_dispatch",
    title: "Zapsat výdej (po potvrzeném předání/závozu)",
    description:
      "ZÁPIS — append-only pohyb dispatch_out pro AKTIVNÍ rezervaci a atomicky ji uvolní (fulfilled). Volej až PO potvrzeném předání nebo závozu zákazníkovi, " +
      "reservation_id je z reserve_stock_for_order.",
    write: true,
    properties: {
      reservation_id: { type: "string", description: "id rezervace (UUID) z reserve_stock_for_order." },
      note: { type: "string", description: "Volitelná poznámka k výdeji (max. 2000 znaků)." },
    },
    required: ["reservation_id"],
    parse: (args) => ({
      reservationId: requiredUuid(args, "reservation_id"),
      note: optionalString(args, "note", 2000) ?? "",
    }),
    execute: async (input, issuer) => {
      const result = await recordStockDispatch(input);
      return result.ok ? { ok: true, data: { movementId: result.movementId, url: stockUrl(issuer) } } : result;
    },
  }),

  defineTool({
    name: "adjust_stock_after_inventory",
    title: "Inventurní korekce",
    description:
      "ZÁPIS — append-only korekční pohyb (inventory_correction) podle skutečně napočítaného množství při inventuře. NIKDY nepřepisuje zůstatek přímo — " +
      "appka sama spočítá rozdíl oproti appce a zapíše jeden pohyb (in, pokud je napočítáno víc, jinak out). Důvod je POVINNÝ.",
    write: true,
    properties: {
      stock_item_id: { type: "string", description: "id skladové karty (UUID)." },
      stock_location_id: { type: "string", description: "id skladové lokace (UUID)." },
      counted_quantity: { type: "number", description: "Skutečně napočítané množství při inventuře (0 nebo víc)." },
      reason: { type: "string", description: "Důvod korekce (povinné, max. 500 znaků)." },
      batch_id: { type: "string", description: "Volitelné: id konkrétní šarže (UUID), pokud se korekce týká jedné dávky." },
    },
    required: ["stock_item_id", "stock_location_id", "counted_quantity", "reason"],
    parse: (args) => ({
      stockItemId: requiredUuid(args, "stock_item_id"),
      stockLocationId: requiredUuid(args, "stock_location_id"),
      countedQuantity: (() => {
        const value = args.counted_quantity;
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          throw new ArgError("Argument counted_quantity musí být nula nebo kladné číslo.");
        }
        return value;
      })(),
      reason: requiredString(args, "reason", 500),
      batchId: optionalUuid(args, "batch_id"),
    }),
    execute: async (input, issuer) => {
      const result = await adjustStockAfterInventory(input);
      return result.ok
        ? { ok: true, data: { movementId: result.movementId, direction: result.direction, quantity: result.quantity, url: stockUrl(issuer) } }
        : result;
    },
  }),
];

export type { ToolOutcome };
