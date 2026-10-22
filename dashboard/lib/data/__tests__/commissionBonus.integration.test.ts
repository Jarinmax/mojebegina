// Jarda – volání a provize, část 2 — 3% provize, akviziční bonus a
// oznámení o zaplacené objednávce nad skutečnou datovou vrstvou
// (leads.ts, orders.ts, notifications.ts).
//
// Skutečný zápis přes ovladač Neonu (neon-http, db.batch = jedna
// transakce) napojený na PGlite se všemi migracemi (včetně 0023,
// prepared-only) — stejný harness jako lib/data/__tests__/callHistorySync.test.ts
// a lib/eshop/__tests__/orderWrite.test.ts. Nutné, protože assignCustomerOwner
// (organization_owner_history, viz níž) používá db.batch, který plain
// drizzle-orm/pglite ovladač (createMigratedDb) nepodporuje. Nikdy se
// nepřipojuje k Neonu.
//
// Datumy fixtur jsou odvozené od Date.now() (dny zpátky/dopředu), NE
// pevná kalendářní data — getCustomerDetail/computeCommissionAndBonus
// uvnitř volá `new Date()` (skutečné "teď"), takže pevné datum z jiného
// roku by test rozbilo podle toho, kdy skutečně běží.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { AuthContext } from "../types";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "preview.example", "x-forwarded-proto": "https" }),
}));

const mockedCtx: AuthContext = {
  userId: "admin-1",
  systemRole: "ADMIN",
  grantedRoles: ["ADMIN"],
  roleSelectionRequired: false,
  name: "Test Admin",
  email: "admin@example.com",
};
vi.mock("@/lib/data/authContext", () => ({ getAuthContext: () => Promise.resolve(mockedCtx) }));
vi.mock("@/lib/data/userProfiles", () => ({
  getUserProfile: async (userId: string) => ({ name: `Obchodník ${userId}`, email: `${userId}@example.com` }),
  getUserProfiles: async (ids: string[]) =>
    new Map(ids.map((id) => [id, { name: `Obchodník ${id}`, email: `${id}@example.com` }])),
}));
vi.mock("@/lib/data/admin", () => ({
  createCustomerOrganization: async () => ({ ok: false, error: "not used in this test" }),
  requireAdminContext: async () => mockedCtx,
}));

const DB_TEST = { timeout: 60_000 };
const ORG_OWNER_TEST = "00000000-0000-4000-8000-00000000d000";
const ORG_NEW = "00000000-0000-4000-8000-00000000d001";
const ORG_OLD_BUYER = "00000000-0000-4000-8000-00000000d002";
const ORG_NOTIFY = "00000000-0000-4000-8000-00000000d003";
const ORG_PING_PONG = "00000000-0000-4000-8000-00000000d004";
const JARDA = "jarda-1";
const PETR = "petr-1";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();

describe("Jarda – volání a provize, část 2 — provize, bonus, oznámení", DB_TEST, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let assignCustomerOwner: typeof import("../leads").assignCustomerOwner;
  let setCustomerAcquiredBy: typeof import("../leads").setCustomerAcquiredBy;
  let markAcquisitionBonusPaid: typeof import("../leads").markAcquisitionBonusPaid;
  let getCustomerDetail: typeof import("../leads").getCustomerDetail;
  let updatePaymentStatus: typeof import("../orders").updatePaymentStatus;

  beforeAll(async () => {
    // Preload přesměruje HTTP dotazy ovladače Neonu na PGlite se všemi migracemi.
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("../../db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });

    // lib/db/client.ts exportuje `db` sestavený ze stejného neon()/drizzle()
    // volání — vi.doMock ho nahradí instancí napojenou na PGlite (přes
    // zdola přesměrovaný fetch), aby ji leads.ts/orders.ts (import
    // "@/lib/db/client") používaly beze zbytečné druhé konfigurace.
    vi.doMock("@/lib/db/client", () => ({ db }));

    const leadsModule = await import("../leads");
    assignCustomerOwner = leadsModule.assignCustomerOwner;
    setCustomerAcquiredBy = leadsModule.setCustomerAcquiredBy;
    markAcquisitionBonusPaid = leadsModule.markAcquisitionBonusPaid;
    getCustomerDetail = leadsModule.getCustomerDetail;

    const ordersModule = await import("../orders");
    updatePaymentStatus = ordersModule.updatePaymentStatus;

    // ORG_NEW: akvizice fixovaná 30 dní zpátky (bezpečně uvnitř 183denní
    // lhůty), objednávky po ní.
    const acquiredAt = daysAgo(30);
    const statements = `
      INSERT INTO organizations (id, ico, name, registered_address, owner_user_id)
      VALUES ('${ORG_OWNER_TEST}', '00000000', 'Owner test s.r.o.', 'Ostrava', '${JARDA}');
      INSERT INTO organizations (id, ico, name, registered_address, owner_user_id, acquired_by_user_id, acquired_at)
      VALUES ('${ORG_NEW}', '11111111', 'Nový zákazník s.r.o.', 'Praha', '${JARDA}', '${JARDA}', '${acquiredAt}');
      INSERT INTO organizations (id, ico, name, registered_address, owner_user_id)
      VALUES ('${ORG_OLD_BUYER}', '22222222', 'Starý zákazník s.r.o.', 'Brno', '${JARDA}');
      INSERT INTO organizations (id, ico, name, registered_address, owner_user_id)
      VALUES ('${ORG_NOTIFY}', '33333333', 'Oznámení s.r.o.', 'Plzeň', '${JARDA}');
      INSERT INTO organizations (id, ico, name, registered_address, owner_user_id)
      VALUES ('${ORG_PING_PONG}', '44444444', 'Ping pong s.r.o.', 'Liberec', '${JARDA}');

      INSERT INTO orders (id, buyer_organization_id, channel, contact_email, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at)
      VALUES ('00000000-0000-4000-8000-00000000e001', '${ORG_OLD_BUYER}', 'manual', 'old@example.cz', 20000, 0, 0, 20000, 'paid', 'new', '${daysAgo(400)}');

      INSERT INTO orders (id, buyer_organization_id, channel, contact_email, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at)
      VALUES ('00000000-0000-4000-8000-00000000e002', '${ORG_NEW}', 'manual', 'new@example.cz', 10000, 500, 0, 9500, 'paid', 'new', '${daysAgo(20)}');
      INSERT INTO orders (id, buyer_organization_id, channel, contact_email, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at)
      VALUES ('00000000-0000-4000-8000-00000000e003', '${ORG_NEW}', 'manual', 'new@example.cz', 5000, 0, 0, 5000, 'paid', 'cancelled', '${daysAgo(19)}');
      INSERT INTO orders (id, buyer_organization_id, channel, contact_email, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at)
      VALUES ('00000000-0000-4000-8000-00000000e004', '${ORG_NEW}', 'manual', 'new@example.cz', 7000, 0, 0, 7000, 'unpaid', 'new', '${daysAgo(18)}');

      INSERT INTO orders (id, buyer_organization_id, channel, contact_email, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at)
      VALUES ('00000000-0000-4000-8000-00000000e005', '${ORG_NOTIFY}', 'manual', 'notify@example.cz', 1000, 0, 0, 1000, 'unpaid', 'new', '${daysAgo(1)}');
    `;
    for (const statement of statements.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.execute(sql.raw(statement));
    }
  }, DB_TEST.timeout);

  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;

  it("assignCustomerOwner zapíše organization_owner_history jen při SKUTEČNÉ změně obchodníka, žádný řádek navíc při opakování stejné hodnoty", async () => {
    await assignCustomerOwner(ORG_OWNER_TEST, JARDA); // stejná hodnota jako při insertu výš — žádná historie dosud neexistuje
    const afterSame = await rows(
      sql`SELECT owner_user_id, ended_at FROM organization_owner_history WHERE organization_id = ${ORG_OWNER_TEST}`
    );
    expect(afterSame).toHaveLength(0); // beze změny se žádné období nezaloží

    await assignCustomerOwner(ORG_OWNER_TEST, PETR); // skutečná změna → založí první otevřené období
    const [org] = await rows(sql`SELECT owner_user_id FROM organizations WHERE id = ${ORG_OWNER_TEST}`);
    expect(org.owner_user_id).toBe(PETR);
    const afterChange = await rows(
      sql`SELECT owner_user_id, started_at, ended_at FROM organization_owner_history WHERE organization_id = ${ORG_OWNER_TEST}`
    );
    expect(afterChange).toHaveLength(1);
    expect(afterChange[0]).toMatchObject({ owner_user_id: PETR, ended_at: null });
  });

  it("A→B→A: návrat k dřívějšímu obchodníkovi uzavře a znovu otevře období, historie se NIKDY nepřepisuje ani neztrácí", async () => {
    await assignCustomerOwner(ORG_PING_PONG, PETR); // Jarda → Petr (1. skutečná změna)
    await assignCustomerOwner(ORG_PING_PONG, JARDA); // Petr → Jarda (návrat)

    const periods = await rows(
      sql`SELECT owner_user_id, started_at, ended_at FROM organization_owner_history WHERE organization_id = ${ORG_PING_PONG} ORDER BY started_at`
    );
    // Obě období existují, žádné nebylo přepsáno — jen to první má ended_at.
    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({ owner_user_id: PETR });
    expect(periods[0].ended_at).not.toBeNull();
    expect(periods[1]).toMatchObject({ owner_user_id: JARDA, ended_at: null });

    // Provize aktuálního (znovu Jardy) se počítá od NOVÉHO (druhého) období, ne od nuly/od prvního.
    const detail = await getCustomerDetail(ORG_PING_PONG);
    expect(detail?.commission.commissionSince?.toISOString()).toBe(new Date(periods[1].started_at).toISOString());
  });

  it("setCustomerAcquiredBy nastaví acquiredAt a napodruhé se už NEPŘEPÍŠE", async () => {
    const first = await setCustomerAcquiredBy(ORG_OLD_BUYER, JARDA);
    expect(first.ok).toBe(true);

    const second = await setCustomerAcquiredBy(ORG_OLD_BUYER, PETR);
    expect(second).toMatchObject({ ok: false });

    const [row] = await rows(
      sql`SELECT acquired_by_user_id, acquired_at FROM organizations WHERE id = ${ORG_OLD_BUYER}`
    );
    expect(row.acquired_by_user_id).toBe(JARDA); // ne PETR — druhý zápis se neprosadil
    expect(row.acquired_at).not.toBeNull();
  });

  it("nový zákazník: provize jen z paid+nestornovaných objednávek, bonus progres roste, hranice 15000 ještě není", async () => {
    const detail = await getCustomerDetail(ORG_NEW);
    // 10000-500=9500 se počítá (paid, new); 5000 (paid, cancelled) a 7000 (unpaid) se NEPOČÍTAJÍ.
    expect(detail?.commission.commissionBaseKc).toBe(9500);
    expect(detail?.commission.bonusEligible).toBe(true);
    expect(detail?.commission.bonusProgressKc).toBe(9500);
    expect(detail?.commission.bonusStatus).toBe("running");
    expect(detail?.commission.bonusRemainingKc).toBe(15000 - 9500);
  });

  it("starý zákazník (nakupoval PŘED acquiredAt): bonus 'not_eligible', i když se acquiredAt dodatečně nastaví", async () => {
    // setCustomerAcquiredBy výš (předchozí test) nastavilo acquiredAt ≈ teď —
    // objednávka z daysAgo(400) je dávno před ním.
    const detail = await getCustomerDetail(ORG_OLD_BUYER);
    expect(detail?.commission.bonusEligible).toBe(false);
    expect(detail?.commission.bonusStatus).toBe("not_eligible");
  });

  it("markAcquisitionBonusPaid odmítne, dokud bonus nedosáhl 'reached'", async () => {
    const result = await markAcquisitionBonusPaid(ORG_NEW);
    expect(result).toMatchObject({ ok: false });
  });

  it("updatePaymentStatus → 'paid' zapíše oznámení aktuálnímu správci, opakování stejného stavu žádné druhé nezapíše", async () => {
    const orderId = "00000000-0000-4000-8000-00000000e005";
    const result = await updatePaymentStatus(orderId, "paid");
    expect(result).toMatchObject({ ok: true, changed: true });

    const after = await rows(
      sql`SELECT user_id, organization_id, type FROM notifications WHERE organization_id = ${ORG_NOTIFY}`
    );
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ user_id: JARDA, organization_id: ORG_NOTIFY, type: "order_paid" });

    // Druhé zavolání se stejným cílovým stavem je no-op (changed: false) — žádné druhé oznámení.
    const again = await updatePaymentStatus(orderId, "paid");
    expect(again).toMatchObject({ ok: true, changed: false });
    const afterAgain = await rows(sql`SELECT id FROM notifications WHERE organization_id = ${ORG_NOTIFY}`);
    expect(afterAgain).toHaveLength(1);
  });

  it("markAcquisitionBonusPaid uspěje po dosažení hranice a napodruhé se odmítne (už vyplaceno)", async () => {
    await db.execute(sql`
      INSERT INTO orders (id, buyer_organization_id, channel, contact_email, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at)
      VALUES ('00000000-0000-4000-8000-00000000e006', ${ORG_NEW}, 'manual', 'new@example.cz', 10000, 0, 0, 10000, 'paid', 'new', ${daysAgo(15)})
    `);
    const detail = await getCustomerDetail(ORG_NEW);
    expect(detail?.commission.bonusStatus).toBe("reached");

    const paid = await markAcquisitionBonusPaid(ORG_NEW);
    expect(paid).toMatchObject({ ok: true });

    const again = await markAcquisitionBonusPaid(ORG_NEW);
    expect(again).toMatchObject({ ok: false });

    const detailAfter = await getCustomerDetail(ORG_NEW);
    expect(detailAfter?.commission.bonusStatus).toBe("paid");
  });
});
