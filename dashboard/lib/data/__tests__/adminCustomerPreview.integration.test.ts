// Administrátorský náhled zákaznické karty (/admin/organizace/[id]/nahled) —
// nad PGlite se všemi migracemi. Ověřuje: ADMIN vidí přesně totéž co
// zákazník (stejná data i stejné vykreslení), jen vybranou organizaci;
// session zůstává ADMIN (žádná cookie, žádná impersonace); podvržené id ani
// jiné role kontrolu nepřeskočí; v náhledu není žádný aktivní prvek kromě
// pruhu; zákazník dál vidí jen svou organizaci; náhled funguje i pro
// zákazníka, který ještě nedostal pozvánku.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMigratedDb } from "@/lib/eshop/__tests__/helpers/migratedDb";

const holder = vi.hoisted(() => ({ db: null as unknown, cookieWrites: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/lib/auth/server", () => ({ auth: { getSession: async () => ({ data: null }) } }));
vi.mock("@/lib/auth/client", () => ({ authClient: { signOut: async () => undefined } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (...args: unknown[]) => holder.cookieWrites.push(args),
    delete: (...args: unknown[]) => holder.cookieWrites.push(args),
  }),
}));
// next/image bez Next serveru: obyčejný <img> (stejný v obou pohledech)
vi.mock("next/image", async () => {
  const { createElement: h } = await import("react");
  return {
    default: (props: { src: string | { src: string }; alt: string; className?: string }) =>
      h("img", { src: typeof props.src === "string" ? props.src : props.src.src, alt: props.alt, className: props.className }),
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const EMPLOYEE = "user-employee";
const DKAP_USER = "user-dkap";
const VERONIKA = "user-veronika";
const TOM = "user-tom-herout";
const DKAP = "00000000-0000-4000-8000-0000000d0001";
const CUP = "622f429e-1ddf-464b-9730-cf34d662ba97";
const FFC = "00000000-0000-4000-8000-0000000000ff";
const ORDER = (n: number) => `00000000-0000-4000-8000-00000000a${String(n).padStart(3, "0")}`;

type Role = "ADMIN" | "EXECUTIVE" | "EMPLOYEE" | "CUSTOMER";

describe("administrátorský náhled zákaznické karty", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pg: any;
  let dashboard: typeof import("../dashboard");
  let agentContext: typeof import("@/lib/agent/context");
  let authContext: typeof import("../authContext");
  let PreviewPage: typeof import("@/app/admin/organizace/[id]/nahled/page").default;
  let HomePage: typeof import("@/app/page").default;
  let OrdersPage: typeof import("@/app/objednavky/page").default;
  let ProfilePage: typeof import("@/app/profil/page").default;

  const as = <T,>(userId: string | null, role: Role, fn: () => Promise<T>, name = "Uživatel", email = "x@x.cz") =>
    userId === null
      ? fn()
      : agentContext.runAsAgent({ userId, systemRole: role, grantedRoles: [role], roleSelectionRequired: false, name, email }, fn);
  const asDkap = <T,>(fn: () => Promise<T>) => as(DKAP_USER, "CUSTOMER", fn, "Petr Novák", "petr@dkap.cz");
  const preview = (id: string, zobrazeni?: string) =>
    PreviewPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(zobrazeni ? { zobrazeni } : {}) } as never);
  const html = async (element: Promise<unknown>) => renderToStaticMarkup((await element) as never);
  /** Vnitřek sdíleného rámu karty (CustomerPortalShell) — bez pruhu náhledu. */
  const shell = (markup: string) => {
    const start = markup.indexOf('<div class="min-h-screen bg-neutral-50 relative overflow-hidden">');
    expect(start).toBeGreaterThanOrEqual(0);
    return markup.slice(start, markup.lastIndexOf("</nav>") + "</nav></div>".length);
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
    const created = await createMigratedDb();
    pg = created.pg;
    holder.db = created.db;
    dashboard = await import("../dashboard");
    agentContext = await import("@/lib/agent/context");
    authContext = await import("../authContext");
    PreviewPage = (await import("@/app/admin/organizace/[id]/nahled/page")).default;
    HomePage = (await import("@/app/page")).default;
    OrdersPage = (await import("@/app/objednavky/page")).default;
    ProfilePage = (await import("@/app/profil/page")).default;

    await pg.exec(`
      INSERT INTO user_roles (user_id, system_role) VALUES ('${VINER}', 'ADMIN'), ('${BLAHOUT}', 'EXECUTIVE'), ('${EMPLOYEE}', 'EMPLOYEE');
      INSERT INTO user_profiles (user_id, name, email) VALUES
        ('${VINER}', 'Jaroslav Viner', 'viner.jaroslav@gmail.com'),
        ('${DKAP_USER}', 'Petr Novák', 'petr@dkap.cz'),
        ('${VERONIKA}', 'Veronika', 'razitko-kavarna@seznam.cz'),
        ('${TOM}', 'Tomáš Herout', 'tom.herout@seznam.cz');
      -- DKAP (testovací data): zaplacená s fakturou, nezaplacená s dopravou, stornovaná
      INSERT INTO organizations (id, ico, name, registered_address, status)
        VALUES ('${DKAP}', '99887766', 'DKAP s.r.o.', 'Testovací 1, 110 00 Praha', 'Zákazník Begina');
      INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ('${DKAP_USER}', '${DKAP}', 'owner');
      INSERT INTO orders (id, buyer_organization_id, subtotal_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, channel,
                          shipping_method_label, payment_method_label, customer_note) VALUES
        ('${ORDER(1)}', '${DKAP}', 1516, 0, 1516, 'paid', 'delivered', '2026-10-02T12:00:00Z', 'manual', NULL, 'Převodem', NULL),
        ('${ORDER(2)}', '${DKAP}', 2274, 199, 2473, 'unpaid', 'new', '2026-10-15T12:00:00Z', 'manual', 'Chlazená přeprava', NULL, 'Prosím ráno.'),
        ('${ORDER(3)}', '${DKAP}', 379, 0, 379, 'unpaid', 'cancelled', '2026-10-16T12:00:00Z', 'manual', NULL, NULL, NULL);
      INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES
        ('${ORDER(1)}', 'Dýňová polévka', 4, 379, 1516), ('${ORDER(2)}', 'Kulajda', 6, 379, 2274), ('${ORDER(3)}', 'Lipový sirup', 1, 379, 379);
      INSERT INTO invoices (order_id, organization_id, invoice_number, total_kc, origin, doc_state, issued_at)
        VALUES ('${ORDER(1)}', '${DKAP}', '20260777', 1516, 'manual', 'issued', '2026-10-02T12:00:00Z');
      -- The Cup
      INSERT INTO organizations (id, ico, name, registered_address, status)
        VALUES ('${CUP}', '11935367', 'The Cup s.r.o.', 'Prvního pluku 144/14, 186 00 Praha', 'Zákazník Begina');
      INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ('${VERONIKA}', '${CUP}', 'owner');
      INSERT INTO orders (id, buyer_organization_id, subtotal_kc, total_kc, payment_status, fulfillment_status, ordered_at, channel)
        VALUES ('${ORDER(9)}', '${CUP}', 758, 758, 'paid', 'delivered', '2026-08-30T12:00:00Z', 'import');
      INSERT INTO order_items (order_id, name, quantity, unit_price_kc, line_total_kc) VALUES ('${ORDER(9)}', 'Kulajda', 2, 379, 758);
      INSERT INTO invoices (order_id, organization_id, invoice_number, total_kc, origin, doc_state, issued_at)
        VALUES ('${ORDER(9)}', '${CUP}', '20260152', 758, 'import', 'issued', '2026-08-30T12:00:00Z');
      -- Food Fest Crew: účet založený, pozvánka NEODESLÁNA
      INSERT INTO organizations (id, ico, name, registered_address, status)
        VALUES ('${FFC}', '08911088', 'Food Fest Crew s.r.o.', 'Pasohlávky 251, 691 22 Pasohlávky', 'Zákazník Begina');
      INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ('${TOM}', '${FFC}', 'owner');
      INSERT INTO user_activations (user_id) VALUES ('${TOM}');`);
  }, 120_000);

  afterAll(() => vi.useRealTimers());

  it("ADMIN otevře DKAP a vidí přesně stejné obchodní údaje jako uživatel DKAP", async () => {
    const asCustomer = await asDkap(async () => {
      const { ctx, organizationId } = await dashboard.requireCustomerContext();
      return { account: await dashboard.getCustomerAccount(ctx, organizationId!), orders: await dashboard.getCustomerOrders(ctx, organizationId!) };
    });
    const asAdmin = await as(VINER, "ADMIN", () => dashboard.getCustomerPortalPreviewForAdmin(DKAP));
    expect(asAdmin).not.toBeNull();
    expect(asAdmin!.account).toEqual(asCustomer.account);
    expect(asAdmin!.orders).toEqual(asCustomer.orders);
    // karta zatím ukazuje jen zaplacené objednávky (stejně pro zákazníka i náhled)
    expect(asAdmin!.orders.map((o) => [o.orderNumber, o.status, o.totalKc])).toEqual([["Faktura č. 20260777", "Uhrazeno", 1516]]);
    expect(asAdmin!.previewContact).toEqual({ name: "Petr Novák", email: "petr@dkap.cz" });
  });

  it("vykreslení: náhled = stejný rám, komponenty a pořadí jako skutečná karta (přehled, objednávky, profil)", async () => {
    const customerHome = await asDkap(() => html(HomePage()));
    const customerOrders = await asDkap(() => html(OrdersPage()));
    const customerProfile = await asDkap(() => html(ProfilePage()));
    const adminHome = await as(VINER, "ADMIN", () => html(preview(DKAP)));
    const adminOrders = await as(VINER, "ADMIN", () => html(preview(DKAP, "objednavky")));
    const adminProfile = await as(VINER, "ADMIN", () => html(preview(DKAP, "profil")));

    expect(shell(adminHome)).toBe(shell(customerHome));
    expect(shell(adminOrders)).toBe(shell(customerOrders));
    // jediný rozdíl: „Odhlásit se“ je v náhledu neaktivní kopie
    expect(shell(adminProfile).replace(' disabled=""', "")).toBe(shell(customerProfile));
    expect(shell(adminProfile)).toMatch(/<button type="button" disabled=""[^>]*>Odhlásit se<\/button>/);
    for (const text of ["DKAP s.r.o.", "Petr Novák", "Faktura č. 20260777", "4× Dýňová polévka"]) {
      expect(customerHome + customerOrders + customerProfile).toContain(text);
    }
  });

  it("pruh náhledu: text, „Pouze pro čtení“, „Zpět do administrace“; karta je inert a bez formulářů", async () => {
    for (const view of [undefined, "objednavky", "profil"]) {
      const markup = await as(VINER, "ADMIN", () => html(preview(DKAP, view)));
      expect(markup).toContain("Administrátorský náhled – vidíte kartu jako zákazník DKAP s.r.o.");
      expect(markup).toContain("Pouze pro čtení");
      expect(markup).toContain(`href="/admin/organizace/${DKAP}">Zpět do administrace</a>`);
      expect(markup).toMatch(/<div inert="" aria-label="Zákaznická karta \(náhled, jen pro čtení\)"/);
      // „Objednat znovu“ nabízí poslední objednávku z historie karty
      if (!view) expect(markup).toMatch(/Objednat znovu<\/p><p class="[^"]*">4× Dýňová polévka<\/p>/);
      expect(markup).not.toMatch(/<form|formaction|action=/i);
      // aktivní odkazy jsou jen v pruhu (vše ostatní je uvnitř inert)
      const outside = markup.slice(0, markup.indexOf("<div inert"));
      // (React 19 přidá <link rel="preload"> pro obrázky — to není odkaz k proklikání)
      const links = [...outside.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
      expect(links.length).toBeGreaterThanOrEqual(4);
      expect(links.every((href) => href.startsWith(`/admin/organizace/${DKAP}`))).toBe(true);
    }
  });

  it("ADMIN otevře The Cup a vidí pouze The Cup", async () => {
    const data = await as(VINER, "ADMIN", () => dashboard.getCustomerPortalPreviewForAdmin(CUP));
    expect(data!.account.companyName).toBe("The Cup s.r.o.");
    expect(data!.orders.map((o) => o.orderNumber)).toEqual(["Faktura č. 20260152"]);
    const markup = await as(VINER, "ADMIN", () => html(preview(CUP, "objednavky")));
    expect(markup).not.toMatch(/DKAP|20260777|Food Fest|Petr Novák/);
  });

  it("po návratu je stále ADMIN: žádná cookie, žádná změna identity", async () => {
    holder.cookieWrites.length = 0;
    const after = await as(VINER, "ADMIN", async () => {
      await html(preview(DKAP));
      await html(preview(CUP, "profil"));
      return authContext.getAuthContext();
    });
    expect(after).toMatchObject({ userId: VINER, systemRole: "ADMIN" });
    expect(holder.cookieWrites).toEqual([]);
  });

  it("podvržené id nepřeskočí kontrolu: zákazník DKAP nedostane The Cup ani přes náhled", async () => {
    const { ForbiddenError } = await import("../errors");
    await expect(asDkap(() => dashboard.getCustomerPortalPreviewForAdmin(CUP))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(asDkap(() => preview(CUP))).rejects.toThrow("NEXT_NOT_FOUND");
    // ADMIN s neexistujícím nebo nesmyslným id → 404, ne chyba
    await expect(as(VINER, "ADMIN", () => preview("00000000-0000-4000-8000-000000000999"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(as(VINER, "ADMIN", () => preview("x' OR 1=1 --"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each([
    ["CUSTOMER", VERONIKA],
    ["EMPLOYEE", EMPLOYEE],
    ["EXECUTIVE", BLAHOUT],
    ["nepřihlášený", null],
  ] as const)("%s náhled neotevře (404) a data nedostane", async (role, userId) => {
    const systemRole: Role = role === "nepřihlášený" ? "CUSTOMER" : (role as Role);
    await expect(as(userId, systemRole, () => preview(DKAP))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(as(userId, systemRole, () => dashboard.getCustomerPortalPreviewForAdmin(DKAP))).rejects.toThrow();
  });

  it("zákaznický účet dál vidí jen svou organizaci", async () => {
    await expect(asDkap(async () => {
      const { ctx } = await dashboard.requireCustomerContext();
      return dashboard.getCustomerOrders(ctx, CUP);
    })).rejects.toThrow();
    const own = await asDkap(async () => (await dashboard.requireCustomerContext()).organizationId);
    expect(own).toBe(DKAP);
  });

  it("náhled Food Fest Crew funguje i před odesláním pozvánky", async () => {
    const invited = (await pg.query(`SELECT invited_at FROM user_activations WHERE user_id = '${TOM}'`)).rows[0];
    expect(invited.invited_at).toBeNull();
    const markup = await as(VINER, "ADMIN", () => html(preview(FFC, "profil")));
    expect(markup).toContain("vidíte kartu jako zákazník Food Fest Crew s.r.o.");
    expect(markup).toContain("Tomáš Herout");
    expect(markup).toContain("tom.herout@seznam.cz");
    // náhled nic nezapsal (pozvánka zůstává neodeslaná)
    expect((await pg.query(`SELECT invited_at FROM user_activations WHERE user_id = '${TOM}'`)).rows[0].invited_at).toBeNull();
  });

  it("náhled nic nezapisuje do DB", async () => {
    const snapshot = async () =>
      (await pg.query(`SELECT (SELECT count(*) FROM orders) AS o, (SELECT count(*) FROM invoices) AS i, (SELECT count(*) FROM organization_memberships) AS m,
                              (SELECT count(*) FROM user_activations) AS a, (SELECT count(*) FROM user_profiles) AS p,
                              (SELECT string_agg(payment_status || fulfillment_status, ',' ORDER BY id) FROM orders) AS s`)).rows[0];
    const before = await snapshot();
    for (const view of [undefined, "objednavky", "profil"]) await as(VINER, "ADMIN", () => html(preview(DKAP, view)));
    expect(await snapshot()).toEqual(before);
  });

  it("organizace bez zákaznického účtu: náhled to řekne, nic si nevymýšlí", async () => {
    await pg.exec(`INSERT INTO organizations (id, ico, name, registered_address) VALUES ('00000000-0000-4000-8000-0000000e0001', '55555555', 'Bez účtu s.r.o.', 'Brno')`);
    const markup = await as(VINER, "ADMIN", () => html(preview("00000000-0000-4000-8000-0000000e0001", "profil")));
    expect(markup).toContain("Organizace zatím nemá zákaznický účet");
    expect(createElement).toBeDefined();
  });
});
