// Security Phase 19.3 — "Otevřít kartu zákazníka / historii" z Dnešního
// volání. Nad skutečným Postgresem (PGlite se všemi migracemi), stejný
// princip jako workTasks.integration.test.ts: mockuje se jen auth kontext
// a db klient, zbytek (dailyCalls.ts, skutečné SQL dotazy a constrainty)
// běží doopravdy.
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

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c"; // kurátor — plný přístup
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f"; // prostý pracovník
const STRELEC = "fdc7b836-2325-4568-b9b7-5ac579cd8972"; // EXECUTIVE, ale NENÍ v Dnešním volání vůbec

const asViner = () =>
  (holder.ctx = { userId: VINER, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Jaroslav Viner", email: "v@begina.cz" });
const asBlahout = () =>
  (holder.ctx = { userId: BLAHOUT, systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" });
const asStrelec = () =>
  (holder.ctx = { userId: STRELEC, systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jiří Střelec", email: "s@begina.cz" });

describe("Dnešní volání — 'Otevřít kartu zákazníka / historii' nad DB", { timeout: 120_000 }, () => {
  let db: import("drizzle-orm/neon-http").NeonHttpDatabase<typeof import("@/lib/db/schema")>;
  let dailyCalls: typeof import("../dailyCalls");
  let schema: typeof import("@/lib/db/schema");

  // id leadů/organizace založené jednou v beforeAll, sdílené napříč testy
  // (jen čtou, nic v nich neupravují) — stejný vzor jako workTasks test.
  const LEAD_OWNED_BY_BLAHOUT = "00000000-0000-4000-8000-000000000001";
  const LEAD_CALLED_BY_BLAHOUT_NOT_OWNED = "00000000-0000-4000-8000-000000000002";
  const LEAD_FOREIGN = "00000000-0000-4000-8000-000000000003"; // Viner owner, Blahout ho NIKDY neobvolal
  const LEAD_NOT_INTERESTED = "00000000-0000-4000-8000-000000000004";
  const LEAD_CONVERTED = "00000000-0000-4000-8000-000000000005";
  const LEAD_NOT_CONVERTED = "00000000-0000-4000-8000-000000000006";
  const ORG_ID = "00000000-0000-4000-8000-0000000000a1";
  const ORDER_1 = "00000000-0000-4000-8000-0000000000b1";
  const ORDER_2 = "00000000-0000-4000-8000-0000000000b2";

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    dailyCalls = await import("../dailyCalls");

    await db.execute(sql.raw(`INSERT INTO user_profiles (user_id, name, email) VALUES
      ('${VINER}', 'Jaroslav Viner', 'v@begina.cz'),
      ('${BLAHOUT}', 'Jaroslav Blahout', 'b@begina.cz')`));

    await db.insert(schema.organizations).values({
      id: ORG_ID,
      ico: "12345678",
      name: "Zákazník s.r.o.",
      registeredAddress: "Praha",
      ownerUserId: BLAHOUT,
    });
    await db.insert(schema.orders).values([
      { id: ORDER_1, buyerOrganizationId: ORG_ID, subtotalKc: 1000, totalKc: 1000, paymentStatus: "paid", orderedAt: new Date("2026-09-01") },
      { id: ORDER_2, buyerOrganizationId: ORG_ID, subtotalKc: 500, totalKc: 500, paymentStatus: "paid", orderedAt: new Date("2026-10-01") },
    ]);

    await db.insert(schema.leads).values([
      { id: LEAD_OWNED_BY_BLAHOUT, companyName: "U Kotvy", contactPhone: "+420700000001", source: "existing_database", stage: "new", ownerUserId: BLAHOUT },
      { id: LEAD_CALLED_BY_BLAHOUT_NOT_OWNED, companyName: "Bistro Nový", contactPhone: "+420700000002", source: "existing_database", stage: "contacted", ownerUserId: VINER },
      { id: LEAD_FOREIGN, companyName: "Cizí podnik", contactPhone: "+420700000003", source: "existing_database", stage: "new", ownerUserId: VINER },
      { id: LEAD_NOT_INTERESTED, companyName: "Odmítlo", contactPhone: "+420700000004", source: "existing_database", stage: "not_interested", ownerUserId: BLAHOUT },
      { id: LEAD_CONVERTED, companyName: "Zákazník s.r.o.", contactPhone: "+420700000005", source: "existing_database", stage: "converted", ownerUserId: BLAHOUT, convertedOrganizationId: ORG_ID },
      { id: LEAD_NOT_CONVERTED, companyName: "Ještě lead", contactPhone: "+420700000006", source: "existing_database", stage: "negotiating", ownerUserId: BLAHOUT },
    ]);

    // Blahout SKUTEČNĚ obvolal LEAD_CALLED_BY_BLAHOUT_NOT_OWNED (owner je
    // Viner) — přístup musí fungovat i bez vlastnictví, přesně podle
    // zadání "přidělený NEBO skutečně obvolal".
    await db.insert(schema.leadActivity).values({
      leadId: LEAD_CALLED_BY_BLAHOUT_NOT_OWNED,
      authorUserId: BLAHOUT,
      authorName: "Jaroslav Blahout",
      kind: "call_logged",
      body: "Zatím nerozhodnuto, zavolám znovu příští týden.",
    });
    // Na LEAD_FOREIGN existuje aktivita, ale OD VINERA, ne od Blahouta —
    // nesmí se počítat jako "Blahout obvolal".
    await db.insert(schema.leadActivity).values({
      leadId: LEAD_FOREIGN,
      authorUserId: VINER,
      authorName: "Jaroslav Viner",
      kind: "call_logged",
      body: "Viner volal sám.",
    });
    await db.insert(schema.leadActivity).values({
      leadId: LEAD_NOT_INTERESTED,
      authorUserId: BLAHOUT,
      authorName: "Jaroslav Blahout",
      kind: "call_logged",
      body: "Nemá zájem, nekontaktovat.",
      metadata: { stageChangedTo: "not_interested" },
    });

    // Fronta: jedna položka DONE pro Blahouta (včerejší "Nezájem"), jedna
    // DONE pro Viner (nesmí se Blahoutovi plést do "Nedávno obvoláno").
    await db.insert(schema.dailyCallQueue).values([
      {
        leadId: LEAD_NOT_INTERESTED,
        position: 0,
        status: "done",
        source: "auto",
        addedBy: BLAHOUT,
        addedForDate: "2026-10-30",
        publishedAt: new Date("2026-10-30T08:00:00Z"),
        publishedBy: VINER,
        doneAt: new Date("2026-10-30T09:00:00Z"),
        doneBy: BLAHOUT,
      },
      {
        leadId: LEAD_FOREIGN,
        position: 1,
        status: "done",
        source: "auto",
        addedBy: VINER,
        addedForDate: "2026-10-30",
        publishedAt: new Date("2026-10-30T08:00:00Z"),
        publishedBy: VINER,
        doneAt: new Date("2026-10-30T09:05:00Z"),
        doneBy: VINER,
      },
    ]);
  });

  describe("přístup z karty (přidělený / skutečně obvolaný)", () => {
    it("Blahout otevře kontakt, který je JEMU přiřazený", async () => {
      asBlahout();
      const detail = await dailyCalls.getDailyCallContactDetail(LEAD_OWNED_BY_BLAHOUT);
      expect(detail?.lead.displayName).toContain("U Kotvy");
    });

    it("Blahout otevře kontakt, který SÁM skutečně obvolal, i když mu není přiřazený", async () => {
      asBlahout();
      const detail = await dailyCalls.getDailyCallContactDetail(LEAD_CALLED_BY_BLAHOUT_NOT_OWNED);
      expect(detail?.lead.displayName).toContain("Bistro Nový");
      expect(detail?.activity.some((a) => a.kind === "call_logged" && a.authorUserId === BLAHOUT)).toBe(true);
    });

    it("kurátor (Viner) otevře jakýkoli kontakt bez ohledu na přiřazení/obvolání", async () => {
      asViner();
      const detail = await dailyCalls.getDailyCallContactDetail(LEAD_OWNED_BY_BLAHOUT);
      expect(detail?.lead.displayName).toContain("U Kotvy");
    });
  });

  describe("odmítnutí cizího kontaktu", () => {
    it("Blahout NESMÍ otevřít kontakt, který mu není přiřazený a nikdy ho neobvolal", async () => {
      asBlahout();
      await expect(dailyCalls.getDailyCallContactDetail(LEAD_FOREIGN)).rejects.toThrow();
    });

    it("cizí aktivita NA leadu (od Vinera) se Blahoutovi nepočítá jako jeho vlastní hovor", async () => {
      asBlahout();
      await expect(dailyCalls.getDailyCallContactDetail(LEAD_FOREIGN)).rejects.toThrow();
    });

    it("kdo není ve Dnešním volání vůbec (Střelec), nesmí ani s vlastním obvoláním", async () => {
      asStrelec();
      await expect(dailyCalls.getDailyCallContactDetail(LEAD_OWNED_BY_BLAHOUT)).rejects.toThrow();
    });

    it("obecný seznam/browse přes tuhle funkci neexistuje — jen konkrétní leadId", () => {
      expect(typeof dailyCalls.getDailyCallContactDetail).toBe("function");
      expect(dailyCalls.getDailyCallContactDetail.length).toBe(1);
    });
  });

  describe("kontakt 'Nezájem'", () => {
    it("přístup k historii funguje i u stage 'not_interested'", async () => {
      asBlahout();
      const detail = await dailyCalls.getDailyCallContactDetail(LEAD_NOT_INTERESTED);
      expect(detail?.lead.stage).toBe("not_interested");
      expect(detail?.activity.some((a) => a.body === "Nemá zájem, nekontaktovat.")).toBe(true);
    });

    it("dokončená položka (i 'Nezájem') se objeví v 'Nedávno obvoláno' jen tomu, kdo ji vyřídil", async () => {
      asBlahout();
      const recent = await dailyCalls.listMyRecentlyDoneCalls();
      expect(recent.map((r) => r.leadId)).toContain(LEAD_NOT_INTERESTED);
      expect(recent.map((r) => r.leadId)).not.toContain(LEAD_FOREIGN); // to dokončil Viner, ne Blahout

      asViner();
      const recentViner = await dailyCalls.listMyRecentlyDoneCalls();
      expect(recentViner.map((r) => r.leadId)).toContain(LEAD_FOREIGN);
      expect(recentViner.map((r) => r.leadId)).not.toContain(LEAD_NOT_INTERESTED);
    });
  });

  describe("historie objednávek", () => {
    it("u leadu převedeného na zákazníka vrátí dostupné objednávky, nejnovější první", async () => {
      asBlahout();
      const detail = await dailyCalls.getDailyCallContactDetail(LEAD_CONVERTED);
      expect(detail?.recentOrders).not.toBeNull();
      expect(detail?.recentOrders?.map((o) => o.id)).toEqual([ORDER_2, ORDER_1]);
    });

    it("u leadu, co ještě NENÍ zákazník, je historie objednávek null (ne prázdné pole)", async () => {
      asBlahout();
      const detail = await dailyCalls.getDailyCallContactDetail(LEAD_NOT_CONVERTED);
      expect(detail?.recentOrders).toBeNull();
    });
  });
});
