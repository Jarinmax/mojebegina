// Jardova karta — zákazníci, odměny podle dohody ze 14. 11. 2026, evidence typu
// odměňování a výplaty nad skutečným Postgresem (ovladač Neonu → PGlite se
// všemi migracemi), se stavem jako v produkci po úklidu 15. 11. 2026.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const holder = vi.hoisted(() => ({
  db: null as unknown,
  ctx: null as null | {
    userId: string; systemRole: string; grantedRoles: string[]; roleSelectionRequired: boolean; name: string | null; email: string;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ get db() { return holder.db; } }));
vi.mock("../authContext", () => ({ getAuthContext: async () => holder.ctx }));
vi.mock("@/lib/auth/server", () => ({ sessionAuth: { getSession: async () => ({ data: null }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const asViner = () => (holder.ctx = { userId: VINER, systemRole: "ADMIN", grantedRoles: ["ADMIN"], roleSelectionRequired: false, name: "Jaroslav Viner", email: "v@begina.cz" });
const asBlahout = () => (holder.ctx = { userId: BLAHOUT, systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jaroslav Blahout", email: "b@begina.cz" });
const asStrelec = () => (holder.ctx = { userId: "user-strelec", systemRole: "EXECUTIVE", grantedRoles: ["EXECUTIVE"], roleSelectionRequired: false, name: "Jiří Střelec", email: "s@begina.cz" });

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VIP = id(901), FFC = id(902);
const L_TATIANA = id(1), L_MONIKA = id(2), L_HEROUT = id(3), L_VINER_JOKE = id(4), L_NOORDER = id(5);

describe("Jardova karta nad DB", { timeout: 120_000 }, () => {
  let jr: typeof import("../jardaRewards");
  let holder_exec: (q: string) => Promise<{ body: string }[]>;

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    const db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    holder.db = db;
    jr = await import("../jardaRewards");
    const exec = (q: string) => db.execute(sql.raw(q));
    holder_exec = async (q: string) => (await exec(q)).rows as { body: string }[];
    await exec(`INSERT INTO organizations (id, ico, name, registered_address, owner_user_id) VALUES
      ('${VIP}', '08760381', 'VIP Dogs', 'Praha 6', '${BLAHOUT}'),
      ('${FFC}', '08911088', 'Food Fest Crew s.r.o.', 'Praha', '${VINER}')`);
    await exec(`INSERT INTO leads (id, contact_name, source, stage, owner_user_id, converted_organization_id) VALUES
      ('${L_TATIANA}', 'Tatiana Lisichkina', 'existing_database', 'converted', '${BLAHOUT}', '${VIP}'),
      ('${L_MONIKA}', 'Monika Chuda', 'existing_database', 'converted', '${BLAHOUT}', NULL),
      ('${L_HEROUT}', 'Tomáš Herout', 'existing_database', 'converted', '${BLAHOUT}', '${FFC}'),
      ('${L_VINER_JOKE}', 'Jaroslav Viner', 'existing_database', 'new', '${VINER}', NULL),
      ('${L_NOORDER}', 'Bez objednávky', 'existing_database', 'contacted', '${BLAHOUT}', NULL)`);
    await exec(`INSERT INTO lead_activity (lead_id, author_user_id, author_name, kind, body, created_at) VALUES
      ('${L_TATIANA}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'zájem', '2026-10-02T13:34:00Z'),
      ('${L_TATIANA}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'chce objednat', '2026-10-21T08:52:00Z'),
      ('${L_MONIKA}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'posílám e-mail', '2026-11-06T08:41:00Z'),
      ('${L_HEROUT}', '${VINER}', 'Jaroslav Viner', 'call_logged', 'Vinerův hovor se nepočítá', '2026-10-15T08:00:00Z'),
      ('${L_NOORDER}', '${BLAHOUT}', 'Jaroslav Blahout', 'call_logged', 'nic', '2026-11-01T08:00:00Z')`);
    await exec(`INSERT INTO orders (id, buyer_organization_id, source_lead_id, subtotal_kc, shipping_kc, discount_kc, total_kc, payment_status, fulfillment_status, ordered_at, paid_at, channel, order_number, payment_vs, contact_email) VALUES
      ('${id(101)}', '${VIP}', NULL, 1516, 267, 0, 1783, 'paid', 'delivered', '2026-11-10T10:00:00Z', '2026-11-10T12:00:00Z', 'eshop', 70000011, '70000011', 'vip@example.cz'),
      ('${id(102)}', NULL, '${L_MONIKA}', 199, 267, 0, 466, 'paid', 'new', '2026-11-13T09:00:00Z', '2026-11-14T09:00:00Z', 'eshop', 70000013, '70000013', 'monika@example.cz'),
      ('${id(103)}', '${FFC}', NULL, 11370, 1277, 0, 12647, 'paid', 'delivered', '2026-10-19T00:00:00Z', NULL, 'import', NULL, NULL, NULL),
      ('${id(104)}', NULL, NULL, 129, 0, 0, 129, 'paid', 'new', '2026-11-04T10:00:00Z', '2026-11-04T10:00:00Z', 'eshop', 70000006, '70000006', 'viner@example.cz')`);
    // stav po úklidu: rozpracované kontakty potvrzené při podpisu dohody jako Nový zákazník (bod 6)
    await exec(`INSERT INTO seller_reward_assignments (lead_id, seller_user_id, reward_type, basis, recorded_at, recorded_by) VALUES
      ('${L_TATIANA}', '${BLAHOUT}', 'new', 'confirmed_at_signing', '2026-11-14T12:00:00Z', '${VINER}'),
      ('${L_MONIKA}', '${BLAHOUT}', 'new', 'confirmed_at_signing', '2026-11-14T12:00:00Z', '${VINER}')`);
  });

  it("Jarda vidí své zákazníky a odměnu podle dohody: 5 % ze zboží v prvních 6 měsících", async () => {
    asBlahout();
    const v = await jr.getJardaRewardsView();
    expect(v.isManager).toBe(false);
    expect(v.customers.map((c) => [c.displayName, c.type, c.basis, c.paidGoodsKc, c.totalKc])).toEqual([
      ["Tatiana Lisichkina", "new", "confirmed_at_signing", 1516, 75.8],
      ["Monika Chuda", "new", "confirmed_at_signing", 199, 9.95],
    ]);
    expect(v.customers.every((c) => c.bonus.eligible && !c.bonus.reached)).toBe(true);
    expect(v.excluded).toEqual([]); // kontrolní seznam vidí jen vedoucí
    expect(v.statements.map((s) => [s.month, s.totalKc, s.lines.length])).toEqual([["2026-11", 85.75, 2]]);
    expect(v.summary).toEqual({ customerCount: 2, earnedKc: 85.75, paidOutKc: 0, remainingKc: 85.75 });
  });

  it("vedoucí vidí i nezapočítané (Food Fest Crew: bez evidence, jen Vinerův hovor)", async () => {
    asViner();
    const v = await jr.getJardaRewardsView();
    expect(v.isManager).toBe(true);
    expect(v.excluded.map((e) => [e.displayName, e.reason, e.paidGoodsKc])).toEqual([["Tomáš Herout", "no_assignment", 11370]]);
  });

  it("evidence typu odměňování: Jarda zapíše, duplicitu odmítne, zrušit smí jen vedoucí", async () => {
    asBlahout();
    expect(await jr.getLeadRewardAssignment(L_VINER_JOKE)).toMatchObject({ visible: false });
    expect(await jr.recordRewardAssignment({ leadId: L_VINER_JOKE, type: "new", productIds: [], note: "" })).toEqual({ ok: false, error: "Kontakt nepatří prodejci." });
    expect(await jr.recordRewardAssignment({ leadId: L_NOORDER, type: "upsell", productIds: [], note: "" })).toMatchObject({ ok: false });
    expect(await jr.recordRewardAssignment({ leadId: L_NOORDER, type: "new", productIds: [], note: "kavárna" })).toEqual({ ok: true });
    expect(await jr.recordRewardAssignment({ leadId: L_NOORDER, type: "renewed", productIds: [], note: "" })).toEqual({ ok: false, error: "Kontakt už má evidovaný typ odměňování." });

    const panel = await jr.getLeadRewardAssignment(L_NOORDER);
    expect(panel).toMatchObject({ visible: true, canRecord: false, canCancel: false, assignment: { type: "new", basis: "contract", note: "kavárna" } });
    const v = await jr.getJardaRewardsView();
    expect(v.pending.map((p) => [p.displayName, p.type])).toEqual([["Bez objednávky", "new"]]);
    await expect(jr.cancelRewardAssignment(L_NOORDER)).rejects.toThrow();

    asViner();
    expect(await jr.getLeadRewardAssignment(L_NOORDER)).toMatchObject({ canCancel: true });
    expect(await jr.cancelRewardAssignment(L_NOORDER)).toEqual({ ok: true });
    expect(await jr.cancelRewardAssignment(L_NOORDER)).toEqual({ ok: false, error: "Evidence nenalezena." });
    expect((await jr.getLeadRewardAssignment(L_NOORDER)).canRecord).toBe(true);
    const notes = await holder_exec(`SELECT body FROM lead_activity WHERE lead_id = '${L_NOORDER}' AND kind = 'note_added' ORDER BY created_at`);
    expect(notes.map((r) => r.body)).toEqual([
      "Evidován typ odměňování prodejce: Nový zákazník — kavárna.",
      "Zrušena evidence odměňování prodejce (Nový zákazník).",
    ]);
  });

  it("výplatu zapíše jen vedoucí; Jarda ji vidí a zbývající částka se sníží", async () => {
    asBlahout();
    await expect(jr.addJardaPayout({ amountKc: 50, note: "", paidOn: "" })).rejects.toThrow();
    asViner();
    expect(await jr.addJardaPayout({ amountKc: 0, note: "", paidOn: "" })).toEqual({ ok: false, error: "Zadejte kladnou částku v Kč." });
    expect(await jr.addJardaPayout({ amountKc: 50, note: "listopad", paidOn: "31.12." })).toEqual({ ok: false, error: "Neplatné datum výplaty." });
    expect(await jr.addJardaPayout({ amountKc: 50, note: "listopad", paidOn: "2026-12-15" })).toEqual({ ok: true });
    asBlahout();
    const v = await jr.getJardaRewardsView();
    expect(v.payouts.map((p) => [p.amountKc, p.note])).toEqual([[50, "listopad"]]);
    expect(v.summary).toMatchObject({ paidOutKc: 50, remainingKc: 35.75 });
  });

  it("nikdo jiný kartu nevidí", async () => {
    asStrelec();
    await expect(jr.getJardaRewardsView()).rejects.toThrow();
    expect(await jr.getLeadRewardAssignment(L_TATIANA)).toMatchObject({ visible: false });
    holder.ctx = null;
    await expect(jr.getJardaRewardsView()).rejects.toThrow();
  });
});
