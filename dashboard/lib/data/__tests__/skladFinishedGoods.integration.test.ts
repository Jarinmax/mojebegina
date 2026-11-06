// Sklad 1.1 (hotové výrobky) — nad skutečným Postgresem (PGlite se všemi
// migracemi, stejný princip jako lib/data/__tests__/workTasks.integration.test.ts
// a dailyCallContactAccess.integration.test.ts z téhle session): mockuje se
// jen auth kontext a db klient, zbytek (skladFinishedGoods.ts, skutečné SQL
// dotazy, constrainty, advisory locky) běží doopravdy.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  ctx: null as null | {
    userId: string;
    systemRole: string;
    grantedRoles: string[];
    roleSelectionRequired: boolean;
    name: string | null;
    email: string;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("../authContext", () => ({ getAuthContext: async () => holder.ctx }));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c"; // ADMIN — upload/confirm/void vše
const KONIGSBERGOVA = "f9f93f03-92b0-4724-becd-c0a3576b5275"; // EXECUTIVE — upload/confirm/void vše
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f"; // EXECUTIVE — upload/confirm, BEZ void
const STRELEC = "fdc7b836-2325-4568-b9b7-5ac579cd8972"; // EXECUTIVE — jen čtení cen/originálu

const asViner = () =>
  (holder.ctx = { userId: VINER, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Jaroslav Viner", email: "v@begina.cz" });
const asBlahout = () =>
  (holder.ctx = { userId: BLAHOUT, systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" });
const asStrelec = () =>
  (holder.ctx = { userId: STRELEC, systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jiří Střelec", email: "s@begina.cz" });

const LOCATION_ID = "00000000-0000-4000-8000-00000000a001";
const ITEM_ID = "00000000-0000-4000-8000-00000000a002";
const ORG_ID = "00000000-0000-4000-8000-00000000a003";

describe("Sklad 1.1 — hotové výrobky nad DB", { timeout: 120_000 }, () => {
  let db: import("drizzle-orm/neon-http").NeonHttpDatabase<typeof import("@/lib/db/schema")>;
  let fg: typeof import("../skladFinishedGoods");
  let schema: typeof import("@/lib/db/schema");
  let orderNumberCounter = 10000;

  async function createOrder(): Promise<number> {
    const orderNumber = ++orderNumberCounter;
    await db.insert(schema.orders).values({
      orderNumber,
      buyerOrganizationId: ORG_ID,
      subtotalKc: 100,
      totalKc: 100,
      paymentStatus: "unpaid",
    });
    return orderNumber;
  }

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    fg = await import("../skladFinishedGoods");

    await db.execute(sql.raw(`INSERT INTO user_profiles (user_id, name, email) VALUES
      ('${VINER}', 'Jaroslav Viner', 'v@begina.cz'),
      ('${KONIGSBERGOVA}', 'Lucie Königsbergová', 'l@begina.cz'),
      ('${BLAHOUT}', 'Jaroslav Blahout', 'b@begina.cz')`));

    await db.insert(schema.stockLocations).values({ id: LOCATION_ID, code: "test_sklad", name: "Testovací sklad" });
    await db.insert(schema.stockItems).values({ id: ITEM_ID, name: "Dýňová polévka", canonicalUnit: "ks", kind: "finished_good" });
    await db.insert(schema.organizations).values({ id: ORG_ID, ico: "87654321", name: "Testovací zákazník", registeredAddress: "Praha" });
  });

  describe("příjem výroby (recordProductionBatch)", () => {
    it("Blahout zapíše novou šarži — vznikne append-only production_in pohyb a fyzický stav se zvýší", async () => {
      asBlahout();
      const result = await fg.recordProductionBatch({
        stockItemId: ITEM_ID,
        quantity: 38,
        batchCode: "L-20261106-DYN-01",
        producedAt: "2026-11-06",
        bestBeforeAt: "2027-05-06",
        stockLocationId: LOCATION_ID,
        responsibleUserId: BLAHOUT,
        note: "Noční var, 5.–6. 11.",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.batchCode).toBe("L-20261106-DYN-01");

      const stock = await fg.listStock();
      const row = stock.find((r) => r.stockItemId === ITEM_ID && r.stockLocationId === LOCATION_ID);
      expect(row?.physicalQuantity).toBe(38);
      expect(row?.freeQuantity).toBe(38);
    });

    it("stejné označení šarže podruhé je odmítnuto (unikátní), appka nehlásí neřešenou SQL chybu", async () => {
      asBlahout();
      const result = await fg.recordProductionBatch({
        stockItemId: ITEM_ID,
        quantity: 5,
        batchCode: "L-20261106-DYN-01",
        producedAt: "2026-11-06",
        bestBeforeAt: "2027-05-06",
        stockLocationId: LOCATION_ID,
        responsibleUserId: BLAHOUT,
        note: "Duplicitní pokus.",
      });
      expect(result).toEqual({ ok: false, error: expect.stringContaining("L-20261106-DYN-01") });
    });

    it("Střelec (jen čtení) nesmí zapsat příjem výroby", async () => {
      asStrelec();
      await expect(
        fg.recordProductionBatch({
          stockItemId: ITEM_ID,
          quantity: 1,
          batchCode: "L-JINA-SARZE",
          producedAt: "2026-11-06",
          bestBeforeAt: "2027-05-06",
          stockLocationId: LOCATION_ID,
          responsibleUserId: BLAHOUT,
          note: "x",
        })
      ).rejects.toThrow();
    });

    it("poznámka je povinná — validace ji odmítne dřív, než se cokoli zapíše", async () => {
      asBlahout();
      const result = await fg.recordProductionBatch({
        stockItemId: ITEM_ID,
        quantity: 1,
        batchCode: "L-BEZ-POZNAMKY",
        producedAt: "2026-11-06",
        bestBeforeAt: "2027-05-06",
        stockLocationId: LOCATION_ID,
        responsibleUserId: BLAHOUT,
        note: "   ",
      });
      expect(result).toEqual({ ok: false, error: "Poznámka je povinná." });
      const stock = await fg.listStock();
      expect(stock.find((r) => r.stockItemId === ITEM_ID)?.physicalQuantity).toBe(38); // beze změny
    });
  });

  describe("rezervace pro objednávku (reserveStockForOrder)", () => {
    it("rezervace sníží VOLNÝ stav, fyzický zůstane beze změny", async () => {
      asViner();
      const orderNumber = await createOrder();
      const before = (await fg.listStock()).find((r) => r.stockItemId === ITEM_ID)!;

      const result = await fg.reserveStockForOrder({
        stockItemId: ITEM_ID,
        stockLocationId: LOCATION_ID,
        orderNumber,
        quantity: 30,
        batchId: null,
        note: "Food Fest Crew",
      });
      expect(result.ok).toBe(true);

      const after = (await fg.listStock()).find((r) => r.stockItemId === ITEM_ID)!;
      expect(after.physicalQuantity).toBe(before.physicalQuantity);
      expect(after.reservedQuantity).toBe(before.reservedQuantity + 30);
      expect(after.freeQuantity).toBe(before.freeQuantity - 30);
    });

    it("nedostatek volné zásoby je odmítnutý s přesným hlášením volného stavu", async () => {
      asViner();
      const orderNumber = await createOrder();
      const before = (await fg.listStock()).find((r) => r.stockItemId === ITEM_ID)!;

      const result = await fg.reserveStockForOrder({
        stockItemId: ITEM_ID,
        stockLocationId: LOCATION_ID,
        orderNumber,
        quantity: before.freeQuantity + 1,
        batchId: null,
        note: "",
      });
      expect(result).toEqual({ ok: false, error: expect.stringContaining(`k dispozici je ${before.freeQuantity}`) });
    });

    it("neexistující číslo objednávky je odmítnuté", async () => {
      asViner();
      const result = await fg.reserveStockForOrder({
        stockItemId: ITEM_ID,
        stockLocationId: LOCATION_ID,
        orderNumber: 999999,
        quantity: 1,
        batchId: null,
        note: "",
      });
      expect(result.ok).toBe(false);
    });

    // PGlite má jedno fyzické spojení (viz neon-http-pglite.mjs), takže
    // tenhle test neprokazuje souběh dvou SKUTEČNĚ paralelních Postgres
    // transakcí — ověřuje ale přesně tu SQL podmínku (avail.free >=
    // quantity uvnitř stejné CTE, co lock získala), která přetažení brání i
    // při reálném souběhu: kdyby `ins` čas čtení/zápisu nerozdělovala
    // atomicky, tenhle test by to odhalil (obě volání by uspěla).
    it("dvě rezervace o celý volný stav najednou — jen JEDNA uspěje (SQL podmínka uvnitř stejné atomické CTE)", async () => {
      asViner();
      // Založíme čerstvou kartu jen s 10 ks volnými, ať je souboj jednoznačný.
      const raceItemId = "00000000-0000-4000-8000-00000000a010";
      await db.insert(schema.stockItems).values({ id: raceItemId, name: "Souboj", canonicalUnit: "ks", kind: "finished_good" });
      await fg.recordProductionBatch({
        stockItemId: raceItemId,
        quantity: 10,
        batchCode: "L-SOUBOJ-01",
        producedAt: "2026-11-06",
        bestBeforeAt: "2027-05-06",
        stockLocationId: LOCATION_ID,
        responsibleUserId: VINER,
        note: "Pro test souběhu.",
      });
      const orderA = await createOrder();
      const orderB = await createOrder();

      const [resultA, resultB] = await Promise.all([
        fg.reserveStockForOrder({ stockItemId: raceItemId, stockLocationId: LOCATION_ID, orderNumber: orderA, quantity: 10, batchId: null, note: "" }),
        fg.reserveStockForOrder({ stockItemId: raceItemId, stockLocationId: LOCATION_ID, orderNumber: orderB, quantity: 10, batchId: null, note: "" }),
      ]);
      const successes = [resultA, resultB].filter((r) => r.ok);
      expect(successes).toHaveLength(1);

      const after = (await fg.listStock()).find((r) => r.stockItemId === raceItemId)!;
      expect(after.freeQuantity).toBe(0);
      expect(after.reservedQuantity).toBe(10);
    });
  });

  describe("výdej (recordStockDispatch)", () => {
    it("výdej zapíše dispatch_out pohyb a ATOMICKY uvolní (fulfilled) rezervaci", async () => {
      asViner();
      const orderNumber = await createOrder();
      const reserved = await fg.reserveStockForOrder({
        stockItemId: ITEM_ID,
        stockLocationId: LOCATION_ID,
        orderNumber,
        quantity: 1,
        batchId: null,
        note: "Kafe Patro",
      });
      if (!reserved.ok) throw new Error("setup failed");

      const before = (await fg.listStock()).find((r) => r.stockItemId === ITEM_ID)!;
      const dispatch = await fg.recordStockDispatch({ reservationId: reserved.reservationId, note: "Předáno osobně." });
      expect(dispatch.ok).toBe(true);

      const after = (await fg.listStock()).find((r) => r.stockItemId === ITEM_ID)!;
      expect(after.physicalQuantity).toBe(before.physicalQuantity - 1);
      expect(after.reservedQuantity).toBe(before.reservedQuantity - 1);
      expect(after.freeQuantity).toBe(before.freeQuantity); // volný stav se výdejem nemění (šlo o už rezervované)

      const [row] = await db
        .select({ status: schema.stockReservations.status })
        .from(schema.stockReservations)
        .where(sql`${schema.stockReservations.id} = ${reserved.reservationId}`);
      expect(row.status).toBe("fulfilled");
    });

    it("stejnou rezervaci nejde vydat dvakrát", async () => {
      asViner();
      const orderNumber = await createOrder();
      const reserved = await fg.reserveStockForOrder({
        stockItemId: ITEM_ID,
        stockLocationId: LOCATION_ID,
        orderNumber,
        quantity: 1,
        batchId: null,
        note: "",
      });
      if (!reserved.ok) throw new Error("setup failed");
      await fg.recordStockDispatch({ reservationId: reserved.reservationId, note: "" });

      const second = await fg.recordStockDispatch({ reservationId: reserved.reservationId, note: "" });
      expect(second).toEqual({ ok: false, error: "Rezervace už byla vydána." });
    });

    it("Blahout (bez void) smí vydat — výdej je requireConfirmAccess, ne requireVoidAccess", async () => {
      asBlahout();
      const orderNumber = await createOrder();
      const reserved = await fg.reserveStockForOrder({
        stockItemId: ITEM_ID,
        stockLocationId: LOCATION_ID,
        orderNumber,
        quantity: 1,
        batchId: null,
        note: "",
      });
      if (!reserved.ok) throw new Error("setup failed");
      const dispatch = await fg.recordStockDispatch({ reservationId: reserved.reservationId, note: "" });
      expect(dispatch.ok).toBe(true);
    });
  });

  describe("inventurní korekce (adjustStockAfterInventory)", () => {
    it("napočítané méně → append-only 'out' korekce s důvodem", async () => {
      asViner();
      const before = (await fg.listStock()).find((r) => r.stockItemId === ITEM_ID)!;
      const counted = before.physicalQuantity - 2;

      const result = await fg.adjustStockAfterInventory({
        stockItemId: ITEM_ID,
        stockLocationId: LOCATION_ID,
        countedQuantity: counted,
        reason: "Dvě poškozené krabice vyřazeny.",
        batchId: null,
      });
      expect(result).toMatchObject({ ok: true, direction: "out", quantity: 2 });

      const after = (await fg.listStock()).find((r) => r.stockItemId === ITEM_ID)!;
      expect(after.physicalQuantity).toBe(counted);
    });

    it("napočítané přesně stejně → appka nic nezapíše (žádný pohyb s quantity=0)", async () => {
      asViner();
      const before = (await fg.listStock()).find((r) => r.stockItemId === ITEM_ID)!;

      const result = await fg.adjustStockAfterInventory({
        stockItemId: ITEM_ID,
        stockLocationId: LOCATION_ID,
        countedQuantity: before.physicalQuantity,
        reason: "Kontrola, sedí.",
        batchId: null,
      });
      expect(result.ok).toBe(false);
    });

    it("bez důvodu appka korekci odmítne", async () => {
      asViner();
      const result = await fg.adjustStockAfterInventory({
        stockItemId: ITEM_ID,
        stockLocationId: LOCATION_ID,
        countedQuantity: 0,
        reason: "   ",
        batchId: null,
      });
      expect(result).toEqual({ ok: false, error: "Důvod inventurní korekce je povinný." });
    });

    it("Blahout (bez void) NESMÍ dělat inventurní korekci — stejná citlivost jako storno", async () => {
      asBlahout();
      await expect(
        fg.adjustStockAfterInventory({ stockItemId: ITEM_ID, stockLocationId: LOCATION_ID, countedQuantity: 0, reason: "test", batchId: null })
      ).rejects.toThrow();
    });
  });
});
