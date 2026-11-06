// Objednávky: stornované objednávky nesmí zůstat zamíchané mezi aktivními —
// uživatel potřebuje první vidět ty, co se ještě řeší/hlídají, ne staré
// stornované. listOrders řadí primárně podle toho (stornovaná dolů), až
// pak podle data objednání (nejnovější první) — ověřeno nad PGlite.
import { describe, expect, it, vi } from "vitest";

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

import { createMigratedDb } from "@/lib/eshop/__tests__/helpers/migratedDb";
import { listOrders } from "../orders";

const DB_TEST = { timeout: 30_000 };

const OLD_ACTIVE = "00000000-0000-4000-8000-0000000000d1";
const NEW_CANCELLED = "00000000-0000-4000-8000-0000000000d2";
const NEWEST_ACTIVE = "00000000-0000-4000-8000-0000000000d3";
const OLD_CANCELLED = "00000000-0000-4000-8000-0000000000d4";

describe("listOrders — řazení", DB_TEST, () => {
  it("stornované objednávky vždy úplně dolů, bez ohledu na datum; mezi sebou zůstávají řazené podle data objednání", async () => {
    const { pg, db } = await createMigratedDb();
    holder.db = db;
    await pg.exec(`
      INSERT INTO orders (id, channel, contact_name, contact_email, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs)
      VALUES
        ('${OLD_ACTIVE}', 'eshop', 'Stará aktivní', 'a@example.cz', 100, 0, 100, 'unpaid', 'new', '2026-01-01', '70000011'),
        ('${NEW_CANCELLED}', 'eshop', 'Nová stornovaná', 'b@example.cz', 100, 0, 100, 'unpaid', 'cancelled', '2026-09-01', '70000012'),
        ('${NEWEST_ACTIVE}', 'eshop', 'Nejnovější aktivní', 'c@example.cz', 100, 0, 100, 'unpaid', 'new', '2026-10-01', '70000013'),
        ('${OLD_CANCELLED}', 'eshop', 'Stará stornovaná', 'd@example.cz', 100, 0, 100, 'unpaid', 'cancelled', '2026-02-01', '70000014');`);

    const { orders } = await listOrders();
    const ids = orders.map((o) => o.id).filter((id) => [OLD_ACTIVE, NEW_CANCELLED, NEWEST_ACTIVE, OLD_CANCELLED].includes(id));
    expect(ids).toEqual([NEWEST_ACTIVE, OLD_ACTIVE, NEW_CANCELLED, OLD_CANCELLED]);
  });
});
