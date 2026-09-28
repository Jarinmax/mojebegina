// ESHOP 1.0, krok 7 — skutečné datové funkce MojeBegina (Objednávky, CRM)
// nad PGlite se VŠEMI migracemi a objednávkou soukromého zákazníka
// (buyer_organization_id NULL). Ověřuje, že nic nespadne a soukromý
// zákazník neprosákne do statistik organizací. Nikdy se nepřipojuje k Neonu.
import { beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/lib/data/authContext", () => ({
  getAuthContext: async () => ({
    userId: "admin-1",
    systemRole: "ADMIN",
    grantedRoles: ["ADMIN"],
    roleSelectionRequired: false,
    name: "Test Admin",
    email: "admin@example.com",
  }),
}));
vi.mock("@/lib/data/userProfiles", () => ({
  getUserProfile: async () => null,
  getUserProfiles: async () => new Map(),
}));
vi.mock("@/lib/data/admin", () => ({ createCustomerOrganization: async () => ({ ok: false }) }));

import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "@/lib/eshop/__tests__/helpers/migratedDb";
import { getOrderDetail, listOrders } from "../orders";
import { findDuplicateOrganizations, getCustomerDetail, listCustomers } from "../leads";

const DB_TEST = { timeout: 30_000 };
const ORG = "00000000-0000-4000-8000-000000000001";
const ORG_ORDER = "00000000-0000-4000-8000-0000000000a1";
const GUEST_ORDER = "00000000-0000-4000-8000-0000000000b1";
const LEAD = "00000000-0000-4000-8000-0000000000c1";

describe("objednávka bez organizace v MojeBegina", DB_TEST, () => {
  let pg: PGlite;

  beforeAll(async () => {
    const migrated = await createMigratedDb();
    pg = migrated.pg;
    holder.db = migrated.db;
    await pg.exec(`
      INSERT INTO organizations (id, ico, name, registered_address) VALUES ('${ORG}', '11935367', 'The Cup s.r.o.', 'Praha');
      INSERT INTO orders (id, buyer_organization_id, contact_email, subtotal_kc, shipping_kc, total_kc, payment_status, ordered_at)
      VALUES ('${ORG_ORDER}', '${ORG}', 'firma@example.cz', 758, 0, 758, 'paid', '2026-09-01');
      INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc)
      VALUES ('${ORG_ORDER}', 'Kulajda', 2, 379, 758);
      INSERT INTO orders (id, channel, contact_name, contact_email, subtotal_kc, shipping_kc, total_kc, payment_status, ordered_at)
      VALUES ('${GUEST_ORDER}', 'eshop', 'Jana Nováková', 'jana@example.cz', 379, 99, 478, 'unpaid', '2026-09-20');
      INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc)
      VALUES ('${GUEST_ORDER}', 'Rajčatová polévka', 1, 379, 379);
      INSERT INTO leads (id, source, contact_email) VALUES ('${LEAD}', 'eshop', 'jana@example.cz');`);
  }, DB_TEST.timeout);

  it("seznam Objednávek ukáže soukromého zákazníka jako „Soukromý zákazník“ se jménem kontaktu", async () => {
    const { orders, counts } = await listOrders();
    const guest = orders.find((o) => o.id === GUEST_ORDER);
    expect(guest).toMatchObject({
      buyerOrganizationId: null,
      buyerOrganizationName: "Soukromý zákazník",
      contactName: "Jana Nováková",
      itemsSummary: "1× Rajčatová polévka",
      totalKc: 478,
      orderNumber: null,
    });
    expect(orders.find((o) => o.id === ORG_ORDER)?.buyerOrganizationName).toBe("The Cup s.r.o.");
    expect(counts).toEqual({ new: 2, inProcess: 0, readyForDelivery: 0, awaitingPayment: 1 });
  });

  it("detail objednávky soukromého zákazníka se načte včetně kontaktu a položek", async () => {
    const detail = await getOrderDetail(GUEST_ORDER);
    expect(detail?.order).toMatchObject({
      buyerOrganizationName: "Soukromý zákazník",
      contactEmail: "jana@example.cz",
      shippingKc: 99,
    });
    expect(detail?.items).toEqual([{ name: "Rajčatová polévka", quantity: 1, unitPriceKc: 379, lineTotalKc: 379 }]);
  });

  it("číslo objednávky se zobrazí, jen když existuje (před krokem 6b žádné)", async () => {
    await pg.exec(`UPDATE orders SET order_number = 5094 WHERE id = '${GUEST_ORDER}'`);
    const { orders } = await listOrders();
    expect(orders.find((o) => o.id === GUEST_ORDER)?.orderNumber).toBe(5094);
    expect(orders.find((o) => o.id === ORG_ORDER)?.orderNumber).toBeNull();
    await pg.exec(`UPDATE orders SET order_number = NULL WHERE id = '${GUEST_ORDER}'`);
  });

  it("CRM: shoda e-mailu s objednávkou soukromého zákazníka nespadne a nenabídne organizaci", async () => {
    const candidates = await findDuplicateOrganizations(LEAD);
    expect(candidates.contactMatches).toEqual([]);
  });

  it("CRM: statistiky zákazníků počítají jen objednávky organizace", async () => {
    const customers = await listCustomers("all");
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ id: ORG, orderCount: 1, totalRevenueKc: 758 });
    const detail = await getCustomerDetail(ORG);
    expect(detail).toMatchObject({ orderCount: 1, totalRevenueKc: 758 });
  });
});
