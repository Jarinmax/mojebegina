// Zákaznická karta Food Fest Crew podle vzoru The Cup — nad PGlite se všemi
// migracemi: stav po kroku 1 (zákazník + účet z převodu leadu) a objednávka
// 5215 (tady vložená přímo; import skriptem testuje foodFestCrewImport.test.ts).
// Zákaznická datová vrstva (lib/data/dashboard.ts): každý vidí jen svou
// organizaci a své objednávky, úplná historie (doprava, platba, faktura,
// poznámka).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMigratedDb } from "@/lib/eshop/__tests__/helpers/migratedDb";

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/lib/auth/server", () => ({ auth: { getSession: async () => ({ data: null }) } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const TOM = "user-tom-herout";
const VERONIKA = "user-veronika";
const CUP = "622f429e-1ddf-464b-9730-cf34d662ba97";
const FFC = "00000000-0000-4000-8000-0000000000ff";

describe("karta Food Fest Crew podle vzoru The Cup", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pg: any;
  let dashboard: typeof import("../dashboard");
  let agentContext: typeof import("@/lib/agent/context");
  const customer = (userId: string, email: string) => ({
    userId,
    systemRole: "CUSTOMER" as const,
    grantedRoles: ["CUSTOMER" as const],
    roleSelectionRequired: false,
    name: "Zákazník",
    email,
  });
  const asCustomer = <T,>(userId: string, email: string, fn: () => Promise<T>) => agentContext.runAsAgent(customer(userId, email), fn);

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
    const created = await createMigratedDb();
    pg = created.pg;
    holder.db = created.db;
    dashboard = await import("../dashboard");
    agentContext = await import("@/lib/agent/context");

    await pg.exec(`
      INSERT INTO user_roles (user_id, system_role) VALUES ('${VINER}', 'ADMIN');
      INSERT INTO user_profiles (user_id, name, email) VALUES
        ('${VINER}', 'Jaroslav Viner', 'viner.jaroslav@gmail.com'),
        ('${VERONIKA}', 'Veronika', 'razitko-kavarna@seznam.cz'),
        ('${TOM}', 'Tomáš Herout', 'tom.herout@seznam.cz');
      -- The Cup jako v Preview: organizace, členka, 2 importované zaplacené objednávky s fakturami
      INSERT INTO organizations (id, ico, name, registered_address, status)
        VALUES ('${CUP}', '11935367', 'The Cup s.r.o.', 'Prvního pluku 144/14, 186 00 Praha', 'Zákazník Begina');
      INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ('${VERONIKA}', '${CUP}', 'owner');
      INSERT INTO orders (id, buyer_organization_id, subtotal_kc, total_kc, payment_status, fulfillment_status, ordered_at, channel) VALUES
        ('00000000-0000-4000-8000-00000000c001', '${CUP}', 758, 758, 'paid', 'delivered', '2026-08-30T12:00:00Z', 'import'),
        ('00000000-0000-4000-8000-00000000c002', '${CUP}', 1137, 1137, 'paid', 'delivered', '2026-09-03T12:00:00Z', 'import');
      INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES
        ('00000000-0000-4000-8000-00000000c001', 'Dýňová polévka', 1, 379, 379), ('00000000-0000-4000-8000-00000000c001', 'Kulajda', 1, 379, 379),
        ('00000000-0000-4000-8000-00000000c002', 'Rajčatová polévka', 3, 379, 1137);
      INSERT INTO invoices (order_id, organization_id, invoice_number, total_kc, origin, doc_state, issued_at) VALUES
        ('00000000-0000-4000-8000-00000000c001', '${CUP}', '20260152', 758, 'import', 'issued', '2026-08-30T12:00:00Z'),
        ('00000000-0000-4000-8000-00000000c002', '${CUP}', '20260153', 1137, 'import', 'issued', '2026-09-03T12:00:00Z');
      -- krok 1 (převod leadu v MojeBegina): zákazník + účet bez hesla a bez pozvánky
      INSERT INTO organizations (id, ico, name, registered_address, status)
        VALUES ('${FFC}', '08911088', 'Food Fest Crew s.r.o.', 'Pasohlávky 251, 691 22 Pasohlávky', 'Zákazník Begina');
      INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ('${TOM}', '${FFC}', 'owner');
      INSERT INTO user_activations (user_id) VALUES ('${TOM}');
      -- objednávka 5215 (WooCommerce) tak, jak ji zapíše import
      INSERT INTO orders (id, buyer_organization_id, contact_name, contact_email, contact_phone, subtotal_kc, shipping_kc, total_kc,
                          payment_status, fulfillment_status, ordered_at, paid_at, channel, external_woocommerce_id,
                          shipping_method_label, payment_method_label, customer_note)
      VALUES ('00000000-0000-4000-8000-00000000f215', '${FFC}', 'Tomáš Herout', 'tom.herout@seznam.cz', '+420 723 141 743', 11370, 1277, 12647,
              'paid', 'new', '2026-10-19 06:23:00 Europe/Prague', '2026-10-19 06:23:00 Europe/Prague', 'import', '5215',
              'Chlazená přeprava', 'Platba kartou (WooCommerce)', 'Prosím o dovoz do Drnholce do areálu Světa bludišť, děkuji.');
      INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc)
      VALUES ('00000000-0000-4000-8000-00000000f215', 'Dýňová polévka', 30, 379, 11370);`);
  }, 120_000);

  afterAll(() => vi.useRealTimers());

  it("Tomáš vidí jen Food Fest Crew a jen její objednávky — s dopravou, platbou, fakturou a poznámkou", async () => {
    const result = await asCustomer(TOM, "tom.herout@seznam.cz", async () => {
      const { ctx, organizationId } = await dashboard.requireCustomerContext();
      return {
        organizationId,
        account: await dashboard.getCustomerAccount(ctx, organizationId!),
        orders: await dashboard.getCustomerOrders(ctx, organizationId!),
      };
    });
    expect(result.organizationId).toBe(FFC);
    expect(result.account).toMatchObject({ companyName: "Food Fest Crew s.r.o.", ico: "08911088", registeredAddress: "Pasohlávky 251, 691 22 Pasohlávky" });
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({
      orderNumber: "Objednávka č. 5215",
      date: "19. 10. 2026",
      products: "30× Dýňová polévka",
      totalKc: 12647,
      goodsKc: 11370,
      status: "Uhrazeno",
      shipping: { label: "Chlazená přeprava", priceKc: 1277 },
      paymentMethod: "Platba kartou (WooCommerce)",
      invoiceNumber: null,
      customerNote: "Prosím o dovoz do Drnholce do areálu Světa bludišť, děkuji.",
    });
    // partnerský program: jen zboží bez dopravy, jen zaplacené
    expect(dashboard.getCurrentMonthlyPurchase(result.orders)).toBe(11370);
    expect(JSON.stringify(result)).not.toMatch(/The Cup|11935367|20260152/);
  });

  it("Tomáš nedostane data The Cup ani při přímém zadání jejího id", async () => {
    await expect(
      asCustomer(TOM, "tom.herout@seznam.cz", async () => {
        const { ctx } = await dashboard.requireCustomerContext();
        return dashboard.getCustomerOrders(ctx, CUP);
      })
    ).rejects.toThrow();
    await expect(
      asCustomer(TOM, "tom.herout@seznam.cz", async () => {
        const { ctx } = await dashboard.requireCustomerContext();
        return dashboard.getCustomerAccount(ctx, CUP);
      })
    ).rejects.toThrow();
  });

  it("The Cup beze změny: Veronika vidí jen své 2 faktury, nic z Food Fest Crew", async () => {
    const orders = await asCustomer(VERONIKA, "razitko-kavarna@seznam.cz", async () => {
      const { ctx, organizationId } = await dashboard.requireCustomerContext();
      expect(organizationId).toBe(CUP);
      return dashboard.getCustomerOrders(ctx, organizationId!);
    });
    expect(orders.map((o) => [o.orderNumber, o.totalKc, o.status, o.shipping])).toEqual([
      ["Faktura č. 20260153", 1137, "Uhrazeno", null],
      ["Faktura č. 20260152", 758, "Uhrazeno", null],
    ]);
    expect(JSON.stringify(orders)).not.toMatch(/Food Fest|5215|Herout/);
    await expect(
      asCustomer(VERONIKA, "razitko-kavarna@seznam.cz", async () => {
        const { ctx } = await dashboard.requireCustomerContext();
        return dashboard.getCustomerOrders(ctx, FFC);
      })
    ).rejects.toThrow();
  });

  it("objednávka se stejným e-mailem, ale bez vazby na firmu, se na kartě neukáže (e-mail nic nepřiřazuje sám)", async () => {
    await pg.exec(`
      INSERT INTO orders (buyer_organization_id, contact_email, subtotal_kc, total_kc, payment_status, ordered_at, channel, payment_vs)
      VALUES (NULL, 'tom.herout@seznam.cz', 379, 379, 'unpaid', '2026-10-19T09:00:00Z', 'eshop', '70000099')`);
    const orders = await asCustomer(TOM, "tom.herout@seznam.cz", async () => {
      const { ctx, organizationId } = await dashboard.requireCustomerContext();
      return dashboard.getCustomerOrders(ctx, organizationId!);
    });
    expect(orders).toHaveLength(1);
  });

  it("návrh faktury zákazník nevidí; vystavená faktura se ukáže", async () => {
    const [{ id }] = (await pg.query(`SELECT id FROM orders WHERE external_woocommerce_id = '5215'`)).rows;
    await pg.exec(`INSERT INTO invoices (order_id, organization_id, total_kc, origin, doc_state) VALUES ('${id}', '${FFC}', 12647, 'manual', 'draft')`);
    const load = () =>
      asCustomer(TOM, "tom.herout@seznam.cz", async () => {
        const { ctx, organizationId } = await dashboard.requireCustomerContext();
        return dashboard.getCustomerOrders(ctx, organizationId!);
      });
    expect((await load())[0]).toMatchObject({ orderNumber: "Objednávka č. 5215", invoiceNumber: null });
    await pg.exec(`UPDATE invoices SET doc_state = 'issued', invoice_number = '20260999', issued_at = now() WHERE order_id = '${id}'`);
    expect((await load())[0]).toMatchObject({ orderNumber: "Faktura č. 20260999", invoiceNumber: "20260999" });
  });
});
