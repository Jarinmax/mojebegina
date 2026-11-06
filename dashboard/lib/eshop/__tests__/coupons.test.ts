// Slevové kupóny (zadání Lucie 6. 11. 2026): pravidla jako WooCommerce,
// výpočet slevy, odmítnutí s vysvětlením, promítnutí do ceny a uložení.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { emailAllowed, evaluateCoupons, parseCouponCodes, partnerTierFor, type Coupon, type CouponUsage } from "../coupons";
import { priceCart, withCoupons } from "../pricing";
import { validateCheckoutInput, type CheckoutInput } from "../checkout";
import { buildCheckoutSessionParams } from "../stripe/payment";
import { defaultPaymentMethodId, paymentMethodsFor } from "../shipping";
import { catalogIndex } from "./helpers/catalogFixture";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));

const NOW = new Date("2026-11-06T12:00:00Z");

function coupon(overrides: Partial<Coupon> & Pick<Coupon, "code" | "discountType" | "amount">): Coupon {
  return {
    freeShipping: false,
    expiresAt: null,
    minimumAmountKc: null,
    maximumAmountKc: null,
    individualUse: false,
    productSlugs: [],
    excludedProductSlugs: [],
    categorySlugs: [],
    excludedCategorySlugs: [],
    emailRestrictions: [],
    usageLimit: null,
    usageLimitPerUser: null,
    limitUsageToXItems: null,
    ...overrides,
  };
}

const COUPONS = new Map<string, Coupon>(
  [
    coupon({ code: "sleva10", discountType: "percent", amount: 10 }),
    coupon({ code: "minus100", discountType: "fixed_cart", amount: 100, minimumAmountKc: 700 }),
    coupon({ code: "polevky50", discountType: "fixed_product", amount: 50, categorySlugs: ["polevky"] }),
    coupon({ code: "sama", discountType: "percent", amount: 20, individualUse: true }),
    coupon({ code: "stara", discountType: "percent", amount: 10, expiresAt: new Date("2026-10-31T22:59:59Z") }),
    coupon({ code: "vycerpana", discountType: "percent", amount: 10, usageLimit: 3 }),
    coupon({ code: "jednou", discountType: "percent", amount: 10, usageLimitPerUser: 1 }),
    coupon({ code: "firma", discountType: "percent", amount: 15, emailRestrictions: ["*@firma.cz"] }),
    coupon({ code: "doprava", discountType: "fixed_cart", amount: 0, freeShipping: true }),
    coupon({ code: "dvakusy", discountType: "percent", amount: 50, limitUsageToXItems: 2 }),
    // osobní kódy partnerského programu — sleva podle obratu minulého měsíce
    coupon({ code: "thecup", discountType: "partner", amount: 0, partnerLastMonthKc: 6200 }),
    coupon({ code: "kavarna", discountType: "partner", amount: 0, partnerLastMonthKc: 15000 }),
    coupon({ code: "maly", discountType: "partner", amount: 0, partnerLastMonthKc: 1200 }),
    coupon({ code: "velky", discountType: "partner", amount: 9, partnerLastMonthKc: 25000 }),
    coupon({ code: "velkybez", discountType: "partner", amount: 0, partnerLastMonthKc: 25000 }),
  ].map((c) => [c.code, c])
);
const USAGE = new Map<string, CouponUsage>([
  ["vycerpana", { total: 3, byEmail: new Map() }],
  ["jednou", { total: 1, byEmail: new Map([["jana@example.cz", 1]]) }],
]);

function cart(lines: { sku: string; quantity: number }[], shipping = "osobni-odber") {
  const priced = priceCart(lines, shipping, catalogIndex);
  if (!priced.ok) throw new Error(priced.error);
  return priced.value;
}

function evaluate(codes: string[], lines: { sku: string; quantity: number }[], email: string | null = null) {
  const priced = cart(lines);
  return evaluateCoupons(codes, { lines: priced.lines, subtotalKc: priced.subtotalKc, index: catalogIndex, coupons: COUPONS, usage: USAGE, email, now: NOW });
}

const KULAJDA = { sku: "kulajda", quantity: 2 }; // 2 × 379 = 758
const SVARAK = { sku: "svarak-deluxe-3l", quantity: 1 }; // 499

describe("platby — pořadí a výchozí volba (zadání Lucie 6. 11. 2026)", () => {
  it("bankovní převod první a předvybraný, karta za ním — s kartou i bez ní", () => {
    for (const card of [true, false]) {
      expect(paymentMethodsFor(card).map((m) => m.id)).toEqual(["prevod", "karta"]);
      expect(defaultPaymentMethodId(card)).toBe("prevod");
    }
    expect(paymentMethodsFor(true)[1].available).toBe(true);
    expect(paymentMethodsFor(false)[1].available).toBe(false);
  });
});

describe("slevové kódy — výpočet", () => {
  it("kód se porovnává bez ohledu na velikost písmen a mezery; nedůvěryhodný vstup se pročistí", () => {
    expect(parseCouponCodes(JSON.stringify([" SLEVA10 ", "sleva10", 5, "", "Minus100"]))).toEqual(["sleva10", "minus100"]);
    expect(parseCouponCodes("nesmysl")).toEqual([]);
  });

  it("procentní sleva z ceny zboží (10 % z 758 Kč = 76 Kč)", () => {
    expect(evaluate(["sleva10"], [KULAJDA])).toEqual({ ok: true, applied: [{ code: "sleva10", discountKc: 76, freeShipping: false }], discountKc: 76, freeShipping: false });
  });

  it("pevná částka z košíku při splněné minimální útratě", () => {
    expect(evaluate(["minus100"], [KULAJDA])).toMatchObject({ ok: true, discountKc: 100 });
  });

  it("pevná částka z každého kusu jen u způsobilé kategorie (polévky, ne svařák)", () => {
    expect(evaluate(["polevky50"], [KULAJDA, SVARAK])).toMatchObject({ ok: true, discountKc: 100 });
  });

  it("omezení počtu kusů: 50 % jen ze 2 nejdražších kusů", () => {
    // 3 kusy: 499, 379, 379 → 50 % z 499 a 379 = 250 + 190
    expect(evaluate(["dvakusy"], [KULAJDA, SVARAK])).toMatchObject({ ok: true, discountKc: 250 + 190 });
  });

  it("doprava zdarma: v ceně se doprava vynuluje, zboží beze změny", () => {
    const priced = cart([KULAJDA], "rozvoz");
    const result = evaluate(["doprava"], [KULAJDA]);
    expect(result).toMatchObject({ ok: true, discountKc: 0, freeShipping: true });
    if (!result.ok) return;
    const withShipping = withCoupons(priced, result);
    expect(withShipping.shippingKc).toBe(0);
    expect(withShipping.totalKc).toBe(758);
  });

  it("více kódů se sčítá z původní ceny; sleva nikdy nepřesáhne cenu zboží", () => {
    expect(evaluate(["sleva10", "minus100"], [KULAJDA])).toMatchObject({ ok: true, discountKc: 176 });
    const priced = cart([{ sku: "kulajda", quantity: 1 }]);
    expect(withCoupons(priced, { applied: [], discountKc: 9999, freeShipping: false }).totalKc).toBe(0);
  });
});

describe("partnerský program — osobní kód podle úrovně", () => {
  it("úrovně: do 5 000 bez slevy, 5 001–8 000 = 3 %, 8 001–12 000 = 5 %, 12 001–20 000 = 7 %, nad 20 000 individuálně", () => {
    expect([0, 5000, 5001, 8000, 8001, 12001, 20000, 20001].map((kc) => partnerTierFor(kc).discountPercent)).toEqual([0, 0, 3, 3, 5, 7, 7, null]);
  });

  it("3 % a 7 % z ceny zboží podle obratu partnera za minulý měsíc", () => {
    // 3 % z 379 = 11,37 → 11 Kč za kus
    expect(evaluate(["thecup"], [KULAJDA])).toEqual({
      ok: true,
      applied: [{ code: "thecup", discountKc: 22, freeShipping: false, partnerPercent: 3 }],
      discountKc: 22,
      freeShipping: false,
    });
    expect(evaluate(["kavarna"], [KULAJDA])).toMatchObject({ ok: true, discountKc: 2 * 27, applied: [{ partnerPercent: 7 }] });
  });

  it("individuální úroveň (nad 20 000 Kč) = sjednané procento; bez něj vysvětlení", () => {
    expect(evaluate(["velky"], [KULAJDA])).toMatchObject({ ok: true, applied: [{ partnerPercent: 9 }], discountKc: 2 * 34 });
    const r = evaluate(["velkybez"], [KULAJDA]);
    expect(r.ok ? null : r.error).toBe(
      "Partnerský kód „VELKYBEZ“ má individuální podmínky, které zatím nejsou nastavené. Ozvěte se nám prosím na info@begina.cz."
    );
  });

  it("nízký obrat: kód je platný, ale slevu zatím nedává — srozumitelně proč", () => {
    const r = evaluate(["maly"], [KULAJDA]);
    expect(r.ok ? null : r.error.replaceAll("\u00a0", " ")).toBe(
      "Partnerský kód „MALY“ tento měsíc slevu nedává — za minulý měsíc evidujeme uhrazené nákupy zboží za 1 200 Kč a sleva 3 % začíná od 5 001 Kč."
    );
  });
});

describe("slevové kódy — odmítnutí se srozumitelným vysvětlením", () => {
  const error = (codes: string[], lines = [KULAJDA], email: string | null = null) => {
    const r = evaluate(codes, lines, email);
    return r.ok ? null : r.error;
  };

  it("neexistující kód", () => {
    expect(error(["neni"])).toBe("Slevový kód „NENI“ neexistuje. Zkontrolujte prosím, zda je opsaný správně.");
  });
  it("prošlá platnost", () => {
    expect(error(["stara"])).toBe("Platnost slevového kódu „STARA“ skončila 31. 10. 2026.");
  });
  it("vyčerpaný limit použití", () => {
    expect(error(["vycerpana"])).toBe("Slevový kód „VYCERPANA“ už byl vyčerpán.");
  });
  it("nesplněná minimální útrata — kolik chybí", () => {
    expect(error(["minus100"], [{ sku: "kulajda", quantity: 1 }])).toBe(
      "Slevový kód „MINUS100“ platí pro nákup zboží od 700 Kč (bez dopravy). Do této částky vám chybí 321 Kč."
    );
  });
  it("zboží mimo omezení kupónu", () => {
    expect(error(["polevky50"], [SVARAK])).toBe("Slevový kód „POLEVKY50“ se nevztahuje na žádné zboží v košíku.");
  });
  it("„použít samostatně“ nejde kombinovat", () => {
    expect(error(["sleva10", "sama"])).toBe("Slevový kód „SAMA“ nelze kombinovat s jiným slevovým kódem.");
  });
  it("omezení na e-mail a limit na zákazníka se ověří s e-mailem (v košíku ještě ne)", () => {
    expect(error(["firma"])).toBeNull();
    expect(error(["firma"], [KULAJDA], "jana@example.cz")).toBe(
      "Slevový kód „FIRMA“ je určený pro jiný e-mail. Zadejte prosím e-mail, na který vám kód přišel."
    );
    expect(error(["firma"], [KULAJDA], "Petr@Firma.cz")).toBeNull();
    expect(error(["jednou"], [KULAJDA], "JANA@example.cz")).toBe("Slevový kód „JEDNOU“ jste už využili v dřívější objednávce.");
    expect(error(["jednou"], [KULAJDA], "petr@example.cz")).toBeNull();
  });
  it("hvězdička v omezení e-mailu", () => {
    expect(emailAllowed("a@firma.cz", ["*@firma.cz"])).toBe(true);
    expect(emailAllowed("a@firma.cz.evil", ["*@firma.cz"])).toBe(false);
    expect(emailAllowed("x@y.cz", [])).toBe(true);
  });
});

describe("pokladna — sleva v objednávce a v částce pro platbu", () => {
  const input = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
    cart: JSON.stringify([KULAJDA]),
    name: "Jana Nováková",
    email: "jana@example.cz",
    phone: "+420 777 123 456",
    shippingMethodId: "rozvoz",
    paymentMethodId: "prevod",
    street: "Prvního pluku 14",
    city: "Praha",
    zip: "18600",
    note: "",
    termsAccepted: true,
    ageConfirmed: false,
    ...overrides,
  });
  const ctx = { coupons: COUPONS, usage: USAGE, now: NOW };

  it("platný kód: sleva, celková částka = zboží − sleva + doprava", () => {
    const r = validateCheckoutInput(input({ couponCodes: JSON.stringify(["SLEVA10"]) }), catalogIndex, { coupons: ctx });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pricedCart).toMatchObject({ subtotalKc: 758, discountKc: 76, shippingKc: 99, totalKc: 758 - 76 + 99 });
    expect(r.value.pricedCart.coupons).toEqual([{ code: "sleva10", discountKc: 76, freeShipping: false }]);
  });

  it("neplatný kód objednávku zastaví s vysvětlením (nic se tiše nezahodí)", () => {
    const r = validateCheckoutInput(input({ couponCodes: JSON.stringify(["neni"]) }), catalogIndex, { coupons: ctx });
    expect(r).toEqual({
      ok: false,
      error: "Slevový kód „NENI“ neexistuje. Zkontrolujte prosím, zda je opsaný správně. Kód můžete odebrat a objednávku odeslat bez něj.",
    });
  });

  it("platba kartou: Stripe dostane přesně celkovou částku po slevě", () => {
    const params = buildCheckoutSessionParams(
      {
        id: "0b6f7a52-3c1e-4d7a-9a55-6c2f8f0e4a11",
        orderNumber: 9260010,
        paymentVs: "9260010",
        orderedAt: NOW,
        channel: "eshop",
        paymentMethodCode: "karta",
        paymentStatus: "unpaid",
        fulfillmentStatus: "new",
        contactEmail: "jana@example.cz",
        subtotalKc: 758,
        discountKc: 76,
        shippingKc: 99,
        totalKc: 781,
        shippingMethodLabel: "Chlazená přeprava",
        items: [{ name: "Kulajda", quantity: 2, unitPriceKc: 379 }],
      },
      "https://begina.cz"
    );
    const sum = params.line_items!.reduce((s, l) => s + (l.price_data!.unit_amount ?? 0) * (l.quantity ?? 1), 0);
    expect(sum).toBe(781 * 100);
  });
});

describe("kupóny v DB: načtení, uložení objednávky a počítání použití", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    await db.execute(sql`INSERT INTO eshop_coupons (code, discount_type, amount, usage_limit, used_before, used_by_before)
                         VALUES ('test20', 'percent', 20, 2, 1, ARRAY['stary@example.cz'])`);
    await db.execute(sql`INSERT INTO organizations (id, ico, name, registered_address)
                         VALUES ('5a0c1b2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', '99999991', 'Kavárna Test s.r.o.', 'Praha')`);
    await db.execute(sql`INSERT INTO eshop_coupons (code, discount_type, amount, organization_id)
                         VALUES ('kavarna-test', 'partner', 0, '5a0c1b2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d')`);
  }, 60_000);

  it("načte kupón a jeho použití z WooCommerce; po objednávce se použití započítá a limit platí", async () => {
    const { loadCouponContext } = await import("../couponsServer");
    const { saveEshopOrder } = await import("../orderWrite");
    let ctx = await loadCouponContext(db, ["test20", "neni"]);
    expect([...ctx.coupons.keys()]).toEqual(["test20"]);
    expect(ctx.usage.get("test20")).toEqual({ total: 1, byEmail: new Map([["stary@example.cz", 1]]) });

    const checkout = (id: string) =>
      validateCheckoutInput(
        {
          cart: JSON.stringify([KULAJDA]),
          name: "Jana Nováková",
          email: "jana@example.cz",
          phone: "+420 777 123 456",
          shippingMethodId: "osobni-odber",
          paymentMethodId: "prevod",
          street: "",
          city: "",
          zip: "",
          note: id,
          termsAccepted: true,
          ageConfirmed: false,
          couponCodes: JSON.stringify(["TEST20"]),
        },
        catalogIndex,
        { coupons: ctx }
      );
    const first = checkout("1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const id = "7d2b9a1e-6c3f-4e8a-b1d2-0f9e8d7c6b5a";
    expect(await saveEshopOrder(db, id, first.value)).toMatchObject({ ok: true });
    expect(await rows(sql`SELECT subtotal_kc, discount_kc, total_kc FROM orders WHERE id = ${id}`)).toEqual([
      { subtotal_kc: 758, discount_kc: 152, total_kc: 606 },
    ]);
    expect(
      await rows(sql`SELECT metadata->'coupons' AS coupons FROM order_activity WHERE order_id = ${id} AND kind = 'created'`)
    ).toEqual([{ coupons: [{ code: "test20", discountKc: 152, freeShipping: false }] }]);

    // 1 (WooCommerce) + 1 (nový e-shop) = limit 2 → další použití odmítnuto
    ctx = await loadCouponContext(db, ["test20"]);
    expect(ctx.usage.get("test20")!.total).toBe(2);
    expect(checkout("2")).toEqual({
      ok: false,
      error: "Slevový kód „TEST20“ už byl vyčerpán. Kód můžete odebrat a objednávku odeslat bez něj.",
    });
  });

  it("partnerský kód: úroveň z uhrazených objednávek partnera za minulý měsíc (zboží bez dopravy)", async () => {
    const { loadCouponContext, pragueMonthStart } = await import("../couponsServer");
    const now = new Date("2026-11-06T12:00:00Z");
    expect(pragueMonthStart(now, -1).toISOString()).toBe("2026-09-30T22:00:00.000Z"); // 1. 10. 0:00 v Praze (letní čas)
    expect(pragueMonthStart(now, 0).toISOString()).toBe("2026-10-31T23:00:00.000Z"); // 1. 11. 0:00 v Praze
    let ctx = await loadCouponContext(db, ["kavarna-test"], now);
    expect(ctx.coupons.get("kavarna-test")).toMatchObject({ discountType: "partner", partnerLastMonthKc: 0, partnerName: "Kavárna Test s.r.o." });

    // uhrazená říjnová objednávka partnera za 9 000 Kč zboží (+ doprava, ta se nepočítá) → 5 %
    await db.execute(sql`INSERT INTO orders (id, channel, buyer_organization_id, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at)
                         VALUES ('1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b', 'manual', '5a0c1b2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', 9000, 0, 300, 9300, 'paid', 'delivered', '2026-10-15T10:00:00Z')`);
    // neuhrazená a listopadová se nepočítají
    await db.execute(sql`INSERT INTO orders (id, channel, buyer_organization_id, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at)
                         VALUES ('2f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b', 'manual', '5a0c1b2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', 9000, 0, 0, 9000, 'unpaid', 'new', '2026-10-20T10:00:00Z'),
                                ('3f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b', 'manual', '5a0c1b2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', 9000, 0, 0, 9000, 'paid', 'new', '2026-11-02T10:00:00Z')`);
    ctx = await loadCouponContext(db, ["kavarna-test"], now, { partnerInvoices: async () => [] });
    expect(ctx.coupons.get("kavarna-test")!.partnerLastMonthKc).toBe(9000);
    const priced = priceCart([KULAJDA], "osobni-odber", catalogIndex);
    if (!priced.ok) throw new Error(priced.error);
    const r = evaluateCoupons(["kavarna-test"], {
      lines: priced.value.lines,
      subtotalKc: priced.value.subtotalKc,
      index: catalogIndex,
      coupons: ctx.coupons,
      usage: ctx.usage,
      email: null,
      now,
    });
    // 5 % z 379 = 18,95 → 19 Kč za kus
    expect(r).toMatchObject({ ok: true, discountKc: 38, applied: [{ code: "kavarna-test", partnerPercent: 5 }] });
  });

  it("partnerský kód: k objednávkám se přičtou uhrazené říjnové faktury z iDokladu (zboží bez dopravy)", async () => {
    const { loadCouponContext } = await import("../couponsServer");
    const now = new Date("2026-11-06T12:00:00Z");
    const ctx = await loadCouponContext(db, ["kavarna-test"], now, {
      partnerInvoices: async (ico) => {
        expect(ico).toBe("99999991");
        return [
          { invoiceNumber: "9260100", monthKey: "2026-10", paid: true, goodsKc: 4000 },
          { invoiceNumber: "9260101", monthKey: "2026-10", paid: false, goodsKc: 50000 },
          { invoiceNumber: "9260102", monthKey: "2026-11", paid: true, goodsKc: 50000 },
        ];
      },
    });
    // 9 000 (objednávka) + 4 000 (faktura) = 13 000 → 7 %
    expect(ctx.coupons.get("kavarna-test")!.partnerLastMonthKc).toBe(13000);
  });

  it("automatická partnerská sleva podle e-mailu: člen organizace partnera dostane úroveň za minulý měsíc", async () => {
    const { loadCouponContext } = await import("../couponsServer");
    const { PARTNER_CODE } = await import("../coupons");
    const now = new Date("2026-11-06T12:00:00Z");
    await db.execute(sql`INSERT INTO user_profiles (user_id, name, email) VALUES ('u-kavarna', 'Pavla', 'Pavla@Kavarna.cz')`);
    await db.execute(sql`INSERT INTO organization_memberships (user_id, organization_id, role)
                         VALUES ('u-kavarna', '5a0c1b2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', 'owner')`);
    const ctx = await loadCouponContext(db, [PARTNER_CODE], now, { email: "pavla@kavarna.cz", partnerInvoices: async () => [] });
    // říjnová uhrazená objednávka organizace za 9 000 Kč zboží → 5 %
    expect(ctx.coupons.get(PARTNER_CODE)).toMatchObject({ discountType: "partner", partnerLastMonthKc: 9000, partnerName: "Kavárna Test s.r.o." });
    const priced = priceCart([KULAJDA], "osobni-odber", catalogIndex);
    if (!priced.ok) throw new Error(priced.error);
    const r = evaluateCoupons([PARTNER_CODE], { lines: priced.value.lines, subtotalKc: priced.value.subtotalKc, index: catalogIndex, coupons: ctx.coupons, usage: ctx.usage, email: "pavla@kavarna.cz", now });
    expect(r).toMatchObject({ ok: true, discountKc: 38, applied: [{ code: PARTNER_CODE, partnerPercent: 5 }] });
  });

  it("automatická partnerská sleva: zákazník bez firmy podle svých objednávek; nízký obrat a neznámý e-mail bez slevy a bez částek", async () => {
    const { loadCouponContext } = await import("../couponsServer");
    const { PARTNER_CODE } = await import("../coupons");
    const now = new Date("2026-11-06T12:00:00Z");
    await db.execute(sql`INSERT INTO orders (id, channel, contact_email, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs)
                         VALUES ('4f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b', 'eshop', 'Host@Example.cz', 6000, 0, 99, 6099, 'paid', 'delivered', '2026-10-10T10:00:00Z', '70009991'),
                                ('5f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b', 'eshop', 'maly@example.cz', 1200, 0, 99, 1299, 'paid', 'delivered', '2026-10-10T10:00:00Z', '70009992')`);
    const priced = priceCart([KULAJDA], "osobni-odber", catalogIndex);
    if (!priced.ok) throw new Error(priced.error);
    const run = async (email: string) => {
      const ctx = await loadCouponContext(db, [PARTNER_CODE], now, { email, partnerInvoices: async () => [] });
      return evaluateCoupons([PARTNER_CODE], { lines: priced.value.lines, subtotalKc: priced.value.subtotalKc, index: catalogIndex, coupons: ctx.coupons, usage: ctx.usage, email, now });
    };
    expect(await run("host@example.cz")).toMatchObject({ ok: true, discountKc: 22, applied: [{ partnerPercent: 3 }] });
    expect(await run("maly@example.cz")).toEqual({
      ok: false,
      code: PARTNER_CODE,
      error: "Na partnerskou slevu tento měsíc nárok nevznikl. Sleva se počítá z uhrazených nákupů zboží (bez dopravy) za minulý kalendářní měsíc, 3 % od 5 001 Kč.",
    });
    expect(await run("neznamy@example.cz")).toEqual({
      ok: false,
      code: PARTNER_CODE,
      error: "K tomuto e-mailu nenacházíme partnerskou úroveň za minulý měsíc, proto partnerská sleva neplatí.",
    });
  });
});

describe("faktury z iDokladu: hodnota zboží bez dopravy a poplatků", () => {
  it("odečte dopravu, přepravu, poštovné, balné i dobírku; zboží nechá", async () => {
    const { invoiceGoodsKc, isShippingOrFeeItem } = await import("@/lib/data/idokladPurchaseHistory");
    for (const name of ["Chlazená přeprava", "Doprava", "Poštovné", "Balné", "Dobírka", "Osobní vyzvednutí — Zahradní Bistro Begina"]) {
      expect(isShippingOrFeeItem(name), name).toBe(true);
    }
    expect(isShippingOrFeeItem("Kulajda — 3 l Rodinná zásoba (bag-in-box)")).toBe(false);
    expect(
      invoiceGoodsKc(1236, [
        { name: "Kulajda", quantity: 3, priceKc: 379 },
        { name: "Chlazená přeprava", quantity: 1, priceKc: 99 },
      ])
    ).toBe(1137);
  });
});
