// Náhled zákaznické karty (/nahled-zakaznika/[id]) s úzkým oprávněním
// customer_card_preview — nad PGlite se všemi migracemi. Ověřuje:
// - přesně 4 udělení podle user_id (Viner, Königsbergová, Střelec, Blahout)
//   otevřou náhled a vidí tlačítko; nikdo jiný (jiný ADMIN, EXECUTIVE,
//   EMPLOYEE, CUSTOMER, nepřihlášený, odebrané udělení, stejné jméno
//   s jiným user_id, oprávněný v roli CUSTOMER) — 404 a žádné tlačítko;
// - stejná data i stejné vykreslení jako u přihlášeného zákazníka, jen
//   vybraná organizace; podvržené id nic neotevře;
// - session beze změny (žádná cookie, žádná impersonace);
// - v náhledu není žádný aktivní prvek kromě pruhu, žádný formulář;
// - trvalý audit jen kdo/kdy/která organizace; bez auditu se náhled
//   neotevře; zákazník, objednávky ani historie se nemění, zákazník nic
//   nevidí ani nedostane;
// - zákazník dál vidí jen svou organizaci; náhled funguje i bez pozvánky.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

// skutečná user_id (ověřeno čtením Preview kopie Production 19. 10. 2026)
const VINER = "de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c";
const LUCIE = "f9f93f03-92b0-4724-becd-c0a3576b5275";
const STRELEC = "fdc7b836-2325-4568-b9b7-5ac579cd8972";
const BLAHOUT = "06240ac4-c050-47ea-998c-6c81389edf9f";
const OTHER_ADMIN = "user-other-admin";
const OTHER_EXECUTIVE = "user-other-executive";
const EMPLOYEE = "user-employee";
const NAMESAKE = "user-namesake-viner"; // stejné jméno i e-mail jako Viner, jiné user_id
const REVOKED = "user-revoked";
const DKAP_USER = "user-dkap";
const VERONIKA = "user-veronika";
const TOM = "user-tom-herout";
const DKAP = "00000000-0000-4000-8000-0000000d0001";
const CUP = "622f429e-1ddf-464b-9730-cf34d662ba97";
const FFC = "00000000-0000-4000-8000-0000000000ff";
const ORDER = (n: number) => `00000000-0000-4000-8000-00000000a${String(n).padStart(3, "0")}`;

type Role = "ADMIN" | "EXECUTIVE" | "EMPLOYEE" | "CUSTOMER";
const ALLOWED: Array<[string, string, Role]> = [
  ["Jaroslav Viner", VINER, "ADMIN"],
  ["Lucie Königsbergová", LUCIE, "EXECUTIVE"],
  ["Jiří Střelec", STRELEC, "EXECUTIVE"],
  ["Jaroslav Blahout", BLAHOUT, "EXECUTIVE"],
];
const DENIED: Array<[string, string | null, Role]> = [
  ["jiný ADMIN bez udělení", OTHER_ADMIN, "ADMIN"],
  ["jiný EXECUTIVE bez udělení", OTHER_EXECUTIVE, "EXECUTIVE"],
  ["EMPLOYEE", EMPLOYEE, "EMPLOYEE"],
  ["CUSTOMER (jiný zákazník)", VERONIKA, "CUSTOMER"],
  ["CUSTOMER (zákazník DKAP)", DKAP_USER, "CUSTOMER"],
  ["nepřihlášený", null, "CUSTOMER"],
  ["odebrané udělení", REVOKED, "EXECUTIVE"],
  ["stejné jméno a e-mail, jiné user_id", NAMESAKE, "ADMIN"],
  ["oprávněná osoba v aktivní roli CUSTOMER", BLAHOUT, "CUSTOMER"],
];

describe("náhled zákaznické karty s oprávněním customer_card_preview", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pg: any;
  let dashboard: typeof import("../dashboard");
  let agentContext: typeof import("@/lib/agent/context");
  let authContext: typeof import("../authContext");
  let PreviewPage: typeof import("@/app/nahled-zakaznika/[id]/page").default;
  let PreviewButton: typeof import("@/components/customer-portal/CustomerPreviewButton").default;
  let HomePage: typeof import("@/app/page").default;
  let OrdersPage: typeof import("@/app/objednavky/page").default;
  let ProfilePage: typeof import("@/app/profil/page").default;

  const as = <T,>(userId: string | null, role: Role, fn: () => Promise<T>, name = "Uživatel", email = "x@x.cz") =>
    userId === null
      ? fn()
      : agentContext.runAsAgent({ userId, systemRole: role, grantedRoles: [role], roleSelectionRequired: false, name, email }, fn);
  const asViner = <T,>(fn: () => Promise<T>) => as(VINER, "ADMIN", fn, "Jaroslav Viner", "viner.jaroslav@gmail.com");
  const asDkap = <T,>(fn: () => Promise<T>) => as(DKAP_USER, "CUSTOMER", fn, "Petr Novák", "petr@dkap.cz");
  const preview = (id: string, zobrazeni?: string, zpet?: string) =>
    PreviewPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({ ...(zobrazeni ? { zobrazeni } : {}), ...(zpet ? { zpet } : {}) }),
    } as never);
  const html = async (element: Promise<unknown>) => renderToStaticMarkup((await element) as never);
  /** Vnitřek sdíleného rámu karty (CustomerPortalShell) — bez pruhu náhledu. */
  const shell = (markup: string) => {
    const start = markup.indexOf('<div class="min-h-screen bg-neutral-50 relative overflow-hidden">');
    expect(start).toBeGreaterThanOrEqual(0);
    return markup.slice(start, markup.lastIndexOf("</nav>") + "</nav></div>".length);
  };
  const auditRows = async () =>
    (await pg.query(`SELECT viewer_user_id, organization_id FROM customer_card_preview_log ORDER BY opened_at, id`)).rows;
  const customerSnapshot = async () =>
    (
      await pg.query(`SELECT md5(concat_ws('|',
        (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM organizations t),
        (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM orders t),
        (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM order_items t),
        (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM invoices t),
        (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM order_activity t),
        (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM organization_memberships t),
        (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM organization_activity t),
        (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY id) FROM notifications t),
        (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY user_id) FROM user_profiles t),
        (SELECT string_agg(row_to_json(t)::text, ',' ORDER BY user_id) FROM user_activations t))) AS h`)
    ).rows[0].h;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T10:00:00Z"));
    const created = await createMigratedDb();
    pg = created.pg;
    holder.db = created.db;
    dashboard = await import("../dashboard");
    agentContext = await import("@/lib/agent/context");
    authContext = await import("../authContext");
    PreviewPage = (await import("@/app/nahled-zakaznika/[id]/page")).default;
    PreviewButton = (await import("@/components/customer-portal/CustomerPreviewButton")).default;
    HomePage = (await import("@/app/page")).default;
    OrdersPage = (await import("@/app/objednavky/page")).default;
    ProfilePage = (await import("@/app/profil/page")).default;

    await pg.exec(`
      INSERT INTO user_roles (user_id, system_role) VALUES
        ('${VINER}', 'ADMIN'), ('${LUCIE}', 'EXECUTIVE'), ('${LUCIE}', 'CUSTOMER'), ('${STRELEC}', 'EXECUTIVE'), ('${STRELEC}', 'CUSTOMER'),
        ('${BLAHOUT}', 'EXECUTIVE'), ('${BLAHOUT}', 'CUSTOMER'), ('${OTHER_ADMIN}', 'ADMIN'), ('${OTHER_EXECUTIVE}', 'EXECUTIVE'),
        ('${EMPLOYEE}', 'EMPLOYEE'), ('${NAMESAKE}', 'ADMIN'), ('${REVOKED}', 'EXECUTIVE');
      INSERT INTO user_profiles (user_id, name, email) VALUES
        ('${VINER}', 'Jaroslav Viner', 'viner.jaroslav@gmail.com'),
        ('${NAMESAKE}', 'Jaroslav Viner', 'viner.jaroslav@gmail.com'),
        ('${DKAP_USER}', 'Petr Novák', 'petr@dkap.cz'),
        ('${VERONIKA}', 'Veronika', 'razitko-kavarna@seznam.cz'),
        ('${TOM}', 'Tomáš Herout', 'tom.herout@seznam.cz');
      -- udělení přesně 4 lidem podle user_id; jedno další udělení odebrané
      INSERT INTO user_permissions (user_id, permission, granted_by_user_id, reason) VALUES
        ('${VINER}', 'customer_card_preview', '${VINER}', 'vedení'), ('${LUCIE}', 'customer_card_preview', '${VINER}', 'vedení'),
        ('${STRELEC}', 'customer_card_preview', '${VINER}', 'vedení'), ('${BLAHOUT}', 'customer_card_preview', '${VINER}', 'vedení');
      INSERT INTO user_permissions (user_id, permission, granted_by_user_id, revoked_at, revoked_by_user_id)
        VALUES ('${REVOKED}', 'customer_card_preview', '${VINER}', '2026-10-18T10:00:00Z', '${VINER}');
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

  it.each(ALLOWED)("%s: vidí tlačítko a otevře náhled DKAP", async (_name, userId, role) => {
    const button = await as(userId, role, async () => renderToStaticMarkup((await PreviewButton({ organizationId: DKAP, origin: "crm" })) as never));
    expect(button).toBe(
      `<a class="text-sm font-medium rounded-lg px-3 py-2 border border-begina-primary-700 text-begina-primary-900" href="/nahled-zakaznika/${DKAP}?zpet=crm">Náhled očima zákazníka</a>`
    );
    const markup = await as(userId, role, () => html(preview(DKAP)));
    expect(markup).toContain("Administrátorský náhled – vidíte kartu jako zákazník DKAP s.r.o.");
  });

  it.each(DENIED)("%s: žádné tlačítko, náhled 404 i se znalostí adresy, data nedostane", async (_name, userId, role) => {
    const before = (await auditRows()).length;
    const button = await as(userId, role, async () => (await PreviewButton({ organizationId: DKAP, origin: "crm" })) ?? null);
    expect(button).toBeNull();
    await expect(as(userId, role, () => preview(DKAP))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(as(userId, role, () => dashboard.getCustomerPortalPreview(DKAP))).rejects.toThrow();
    expect((await auditRows()).length).toBe(before);
  });

  it("udělení platí jen pro aktivní řádek konkrétního user_id: odebrání → okamžitě 404", async () => {
    await expect(as(STRELEC, "EXECUTIVE", () => preview(CUP))).resolves.toBeDefined();
    await pg.exec(`UPDATE user_permissions SET revoked_at = now(), revoked_by_user_id = '${VINER}' WHERE user_id = '${STRELEC}'`);
    await expect(as(STRELEC, "EXECUTIVE", () => preview(CUP))).rejects.toThrow("NEXT_NOT_FOUND");
    await pg.exec(`INSERT INTO user_permissions (user_id, permission, granted_by_user_id) VALUES ('${STRELEC}', 'customer_card_preview', '${VINER}')`);
    await expect(as(STRELEC, "EXECUTIVE", () => preview(CUP))).resolves.toBeDefined();
    // druhé aktivní udělení téhož oprávnění nejde
    await expect(
      pg.exec(`INSERT INTO user_permissions (user_id, permission, granted_by_user_id) VALUES ('${STRELEC}', 'customer_card_preview', '${VINER}')`)
    ).rejects.toThrow(/user_permissions_one_active/);
  });

  it("stejné obchodní údaje jako přihlášený uživatel DKAP", async () => {
    const asCustomer = await asDkap(async () => {
      const { ctx, organizationId } = await dashboard.requireCustomerContext();
      return { account: await dashboard.getCustomerAccount(ctx, organizationId!), orders: await dashboard.getCustomerOrders(ctx, organizationId!) };
    });
    for (const [, userId, role] of ALLOWED) {
      const data = await as(userId, role, () => dashboard.getCustomerPortalPreview(DKAP));
      expect(data!.account).toEqual(asCustomer.account);
      expect(data!.orders).toEqual(asCustomer.orders);
      expect(data!.previewContact).toEqual({ name: "Petr Novák", email: "petr@dkap.cz" });
    }
    // úplná historie (zaplacené, čekající i stornované) — stejně pro zákazníka i náhled
    expect(asCustomer.orders.map((o) => [o.orderNumber, o.status, o.totalKc])).toEqual([
      ["Objednávka z 16. 10. 2026", "Stornováno", 379],
      ["Objednávka z 15. 10. 2026", "Čeká na platbu", 2473],
      ["Faktura č. 20260777", "Uhrazeno", 1516],
    ]);
  });

  it("vykreslení: stejný rám, komponenty a pořadí jako skutečná karta (přehled, objednávky, profil)", async () => {
    const customerHome = await asDkap(() => html(HomePage()));
    const customerOrders = await asDkap(() => html(OrdersPage()));
    const customerProfile = await asDkap(() => html(ProfilePage()));
    const previewHome = await as(LUCIE, "EXECUTIVE", () => html(preview(DKAP)));
    const previewOrders = await as(LUCIE, "EXECUTIVE", () => html(preview(DKAP, "objednavky")));
    const previewProfile = await as(LUCIE, "EXECUTIVE", () => html(preview(DKAP, "profil")));
    expect(shell(previewHome)).toBe(shell(customerHome));
    expect(shell(previewOrders)).toBe(shell(customerOrders));
    // jediný rozdíl: „Odhlásit se“ je v náhledu neaktivní kopie
    expect(shell(previewProfile).replace(' disabled=""', "")).toBe(shell(customerProfile));
    expect(shell(previewProfile)).toMatch(/<button type="button" disabled=""[^>]*>Odhlásit se<\/button>/);
    for (const text of ["DKAP s.r.o.", "Petr Novák", "Faktura č. 20260777", "Chlazená přeprava"]) {
      expect(previewHome + previewOrders + previewProfile).toContain(text);
    }
    // „Objednat znovu“ nabízí poslední NEstornovanou objednávku (ne stornovaný Lipový sirup)
    expect(previewHome).toMatch(/Objednat znovu<\/p><p class="[^"]*">6× Kulajda<\/p>/);
  });

  it("pruh: text, „Pouze pro čtení“, „Zpět do administrace“ podle původu; karta inert, bez formulářů a aktivních prvků", async () => {
    for (const [zpet, back] of [
      ["admin", `/admin/organizace/${DKAP}`],
      ["executive", `/executive/organizace/${DKAP}`],
      ["crm", `/rizeni-firmy/obchod/zakaznici/${DKAP}`],
      ["https://zle.example", `/admin/organizace/${DKAP}`], // neznámý původ → výchozí podle role, nikdy cizí adresa
    ]) {
      for (const view of [undefined, "objednavky", "profil"]) {
        const markup = await asViner(() => html(preview(DKAP, view, zpet)));
        expect(markup).toContain("Pouze pro čtení");
        expect(markup).toContain(`href="${back}">Zpět do administrace</a>`);
        expect(markup).toMatch(/<div inert="" aria-label="Zákaznická karta \(náhled, jen pro čtení\)"/);
        expect(markup).not.toMatch(/<form|formaction|action=/i);
        expect(markup).not.toContain("zle.example");
        const outside = markup.slice(0, markup.indexOf("<div inert"));
        // (React 19 přidá <link rel="preload"> pro obrázky — to není odkaz k proklikání)
        const links = [...outside.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]);
        expect(links).toHaveLength(4);
        expect(links.every((href) => href === back || href.startsWith(`/nahled-zakaznika/${DKAP}?`))).toBe(true);
      }
    }
  });

  it("noindex v metadatech stránky", async () => {
    const mod = await import("@/app/nahled-zakaznika/[id]/page");
    expect(mod.metadata).toEqual({ robots: { index: false, follow: false } });
    expect(mod.dynamic).toBe("force-dynamic");
  });

  it("The Cup: oprávněný vidí pouze The Cup", async () => {
    const data = await as(BLAHOUT, "EXECUTIVE", () => dashboard.getCustomerPortalPreview(CUP));
    expect(data!.account.companyName).toBe("The Cup s.r.o.");
    expect(data!.orders.map((o) => o.orderNumber)).toEqual(["Faktura č. 20260152"]);
    const markup = await as(BLAHOUT, "EXECUTIVE", () => html(preview(CUP, "objednavky")));
    expect(markup).not.toMatch(/DKAP|20260777|Food Fest|Petr Novák/);
  });

  it("session beze změny: žádná cookie, identita stále původní", async () => {
    holder.cookieWrites.length = 0;
    for (const [, userId, role] of ALLOWED) {
      const after = await as(userId, role, async () => {
        await html(preview(DKAP));
        await html(preview(CUP, "profil"));
        return authContext.getAuthContext();
      });
      expect(after).toMatchObject({ userId, systemRole: role });
    }
    expect(holder.cookieWrites).toEqual([]);
  });

  it("podvržené id: neexistující / nesmyslné → 404; zákazník DKAP přes náhled k The Cup nesmí", async () => {
    await expect(asViner(() => preview("00000000-0000-4000-8000-000000000999"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(asViner(() => preview("x' OR 1=1 --"))).rejects.toThrow("NEXT_NOT_FOUND");
    const { ForbiddenError } = await import("../errors");
    await expect(asDkap(() => dashboard.getCustomerPortalPreview(CUP))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("audit: trvale jen kdo, kdy a která organizace; nic víc a nic se zákazníkem", async () => {
    await pg.exec(`DELETE FROM customer_card_preview_log`);
    const before = await customerSnapshot();
    await as(LUCIE, "EXECUTIVE", () => html(preview(DKAP)));
    await as(BLAHOUT, "EXECUTIVE", () => html(preview(CUP, "objednavky")));
    const rows = await auditRows();
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { viewer_user_id: LUCIE, organization_id: DKAP },
        { viewer_user_id: BLAHOUT, organization_id: CUP },
      ])
    );
    const columns = (await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'customer_card_preview_log' ORDER BY ordinal_position`)).rows.map(
      (r: { column_name: string }) => r.column_name
    );
    expect(columns).toEqual(["id", "viewer_user_id", "organization_id", "opened_at"]);
    expect((await pg.query(`SELECT opened_at FROM customer_card_preview_log LIMIT 1`)).rows[0].opened_at).toBeInstanceOf(Date);
    // zákazník, objednávky, historie, oznámení, profily ani pozvánky se nezměnily
    expect(await customerSnapshot()).toBe(before);
  });

  it("bez auditního zápisu se náhled neotevře", async () => {
    await pg.exec(`ALTER TABLE customer_card_preview_log RENAME TO customer_card_preview_log_off`);
    try {
      await expect(asViner(() => preview(DKAP))).rejects.toThrow();
    } finally {
      await pg.exec(`ALTER TABLE customer_card_preview_log_off RENAME TO customer_card_preview_log`);
    }
  });

  it("zákazník nic nevidí: jeho karta po náhledech beze změny a bez zmínky o náhledu", async () => {
    const beforeHome = await asDkap(() => html(HomePage()));
    await asViner(() => html(preview(DKAP)));
    await as(LUCIE, "EXECUTIVE", () => html(preview(DKAP, "objednavky")));
    const pages = [await asDkap(() => html(HomePage())), await asDkap(() => html(OrdersPage())), await asDkap(() => html(ProfilePage()))];
    expect(pages[0]).toBe(beforeHome);
    for (const page of pages) expect(page).not.toMatch(/náhled|Administrátor|Pouze pro čtení|nahled-zakaznika/i);
  });

  it("zákaznický účet dál vidí jen svou organizaci", async () => {
    await expect(
      asDkap(async () => {
        const { ctx } = await dashboard.requireCustomerContext();
        return dashboard.getCustomerOrders(ctx, CUP);
      })
    ).rejects.toThrow();
    expect(await asDkap(async () => (await dashboard.requireCustomerContext()).organizationId)).toBe(DKAP);
  });

  it("náhled Food Fest Crew funguje i před odesláním pozvánky", async () => {
    const markup = await as(BLAHOUT, "EXECUTIVE", () => html(preview(FFC, "profil")));
    expect(markup).toContain("vidíte kartu jako zákazník Food Fest Crew s.r.o.");
    expect(markup).toContain("tom.herout@seznam.cz");
    expect((await pg.query(`SELECT invited_at FROM user_activations WHERE user_id = '${TOM}'`)).rows[0].invited_at).toBeNull();
  });

  it("organizace bez zákaznického účtu: náhled to řekne, nic si nevymýšlí", async () => {
    await pg.exec(`INSERT INTO organizations (id, ico, name, registered_address) VALUES ('00000000-0000-4000-8000-0000000e0001', '55555555', 'Bez účtu s.r.o.', 'Brno')`);
    const markup = await asViner(() => html(preview("00000000-0000-4000-8000-0000000e0001", "profil")));
    expect(markup).toContain("Organizace zatím nemá zákaznický účet");
  });
});
