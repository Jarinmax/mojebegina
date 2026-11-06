// Sklad 1.1 MCP nástroje — jen kontrola argumentů (parse), bez DB a bez
// OAuth/session harness (ten pro ÚPLNÝ tok přes callAgentTool pokrývají
// už existující testy jiných domén, např. mcpOrders.integration.test.ts —
// stejná centrální logika idempotence/auditu/limitů v server.ts platí pro
// KAŽDÝ nástroj stejně, sklad ji nijak neobchází ani nedoplňuje). Skutečné
// chování datové vrstvy (atomičnost, souběh, oprávnění) je ověřené v
// lib/data/__tests__/skladFinishedGoods.integration.test.ts nad PGlite —
// tenhle soubor jen ověřuje, že SKLAD_TOOLS správně odmítnou/propustí
// argumenty, než se vůbec dotknou execute().
import { describe, expect, it, vi } from "vitest";
import { ArgError } from "../../args";

// execute() samo (skladFinishedGoods.ts → db) se tu nikdy nevolá — testuje
// se jen parse() — ale celý modulový graf (server-only, DB klient, auth
// kontext) se musí dát bez chyby IMPORTOVAT, proto stejné mocky jako ve
// skladFinishedGoods.integration.test.ts.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: null }));
vi.mock("@/lib/data/authContext", () => ({ getAuthContext: async () => null }));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

const { SKLAD_TOOLS } = await import("../sklad");

function tool(name: string) {
  const found = SKLAD_TOOLS.find((t) => t.definition.name === name);
  if (!found) throw new Error(`nástroj ${name} nenalezen`);
  return found;
}

const ITEM = "11111111-1111-4111-8111-111111111111";
const LOCATION = "22222222-2222-4222-8222-222222222222";
const RESPONSIBLE = "33333333-3333-4333-8333-333333333333";
const RESERVATION = "44444444-4444-4444-8444-444444444444";
// defineTool() ověří idempotency_key JEŠTĚ PŘED tool.parse() u všech zápisů
// (define.ts) — musí být platný ve VŠECH testech níž (i těch na chybu
// jiného pole), jinak by test procházel ze špatného důvodu.
const IDEMPOTENCY_KEY = "test-idempotency-key-0001";

describe("Sklad 1.1 MCP nástroje — definice a kontrola argumentů", () => {
  it("všech pět nástrojů je registrováno s očekávanými jmény a idempotency_key jen u zápisů", () => {
    const names = SKLAD_TOOLS.map((t) => t.definition.name);
    expect(names).toEqual(["list_stock", "record_production_batch", "reserve_stock_for_order", "record_stock_dispatch", "adjust_stock_after_inventory"]);
    for (const t of SKLAD_TOOLS) {
      const required = (t.definition.inputSchema as { required: string[] }).required;
      expect(required.includes("idempotency_key")).toBe(t.write);
    }
    expect(tool("list_stock").write).toBe(false);
  });

  describe("record_production_batch", () => {
    const valid = {
      stock_item_id: ITEM,
      quantity: 38,
      batch_code: "L-20261106-DYN-01",
      produced_at: "2026-11-06",
      best_before_at: "2027-05-06",
      stock_location_id: LOCATION,
      responsible_user_id: RESPONSIBLE,
      note: "Noční var.",
      idempotency_key: IDEMPOTENCY_KEY,
    };

    it("platné argumenty projdou", () => {
      expect(tool("record_production_batch").parse(valid)).toMatchObject({ quantity: 38, batchCode: "L-20261106-DYN-01" });
    });

    it("záporné nebo nulové množství je odmítnuto", () => {
      expect(() => tool("record_production_batch").parse({ ...valid, quantity: 0 })).toThrow(ArgError);
      expect(() => tool("record_production_batch").parse({ ...valid, quantity: -5 })).toThrow(ArgError);
    });

    it("špatný formát data je odmítnut", () => {
      expect(() => tool("record_production_batch").parse({ ...valid, produced_at: "6.11.2026" })).toThrow(ArgError);
    });

    it("neplatné UUID je odmítnuto", () => {
      expect(() => tool("record_production_batch").parse({ ...valid, stock_item_id: "not-a-uuid" })).toThrow(ArgError);
    });

    it("chybějící poznámka je odmítnuta (povinný argument na úrovni nástroje)", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- note se vyřadí záměrně
      const { note: _note, ...withoutNote } = valid;
      expect(() => tool("record_production_batch").parse(withoutNote)).toThrow(ArgError);
    });
  });

  describe("reserve_stock_for_order", () => {
    it("order_number musí být kladné celé číslo, ne UUID", () => {
      const base = { stock_item_id: ITEM, stock_location_id: LOCATION, order_number: 5228, quantity: 30, idempotency_key: IDEMPOTENCY_KEY };
      expect(tool("reserve_stock_for_order").parse(base)).toMatchObject({ orderNumber: 5228, quantity: 30 });
      expect(() => tool("reserve_stock_for_order").parse({ ...base, order_number: -1 })).toThrow(ArgError);
      expect(() => tool("reserve_stock_for_order").parse({ ...base, order_number: 1.5 })).toThrow(ArgError);
    });

    it("batch_id a note jsou nepovinné", () => {
      const parsed = tool("reserve_stock_for_order").parse({
        stock_item_id: ITEM,
        stock_location_id: LOCATION,
        order_number: 5227,
        quantity: 1,
        idempotency_key: IDEMPOTENCY_KEY,
      }) as { batchId: string | null; note: string };
      expect(parsed.batchId).toBeNull();
      expect(parsed.note).toBe("");
    });
  });

  describe("record_stock_dispatch", () => {
    it("reservation_id je povinné UUID", () => {
      expect(tool("record_stock_dispatch").parse({ reservation_id: RESERVATION, idempotency_key: IDEMPOTENCY_KEY })).toMatchObject({
        reservationId: RESERVATION,
      });
      expect(() => tool("record_stock_dispatch").parse({ idempotency_key: IDEMPOTENCY_KEY })).toThrow(ArgError);
    });
  });

  describe("adjust_stock_after_inventory", () => {
    const base = {
      stock_item_id: ITEM,
      stock_location_id: LOCATION,
      counted_quantity: 36,
      reason: "Dvě poškozené krabice.",
      idempotency_key: IDEMPOTENCY_KEY,
    };

    it("platné argumenty projdou, counted_quantity smí být 0", () => {
      expect(tool("adjust_stock_after_inventory").parse(base)).toMatchObject({ countedQuantity: 36 });
      expect(tool("adjust_stock_after_inventory").parse({ ...base, counted_quantity: 0 })).toMatchObject({ countedQuantity: 0 });
    });

    it("záporné napočítané množství je odmítnuto", () => {
      expect(() => tool("adjust_stock_after_inventory").parse({ ...base, counted_quantity: -1 })).toThrow(ArgError);
    });

    it("chybějící důvod je odmítnut", () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reason se vyřadí záměrně
      const { reason: _reason, ...withoutReason } = base;
      expect(() => tool("adjust_stock_after_inventory").parse(withoutReason)).toThrow(ArgError);
    });
  });

  describe("list_stock", () => {
    it("nemá žádné argumenty ani idempotency_key", () => {
      const definition = tool("list_stock").definition;
      expect(definition.inputSchema.required).toEqual([]);
      expect(tool("list_stock").parse({})).toBeNull();
    });
  });
});
