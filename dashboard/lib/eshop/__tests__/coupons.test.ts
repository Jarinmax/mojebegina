// Slevové kupóny (zadání Lucie 6. 11. 2026): pravidla jako WooCommerce,
// výpočet slevy, odmítnutí s vysvětlením, promítnutí do ceny a uložení.
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { emailAllowed, evaluateCoupons, parseCouponCodes, type Coupon, type CouponUsage } from "../coupons";
import { priceCart, withCoupons } from "../pricing";
import { validateCheckoutInput, type CheckoutInput } from "../checkout";
import { buildCheckoutSessionParams } from "../stripe/payment";
import { defaultPaymentMethodId, paymentMethodsFor } from "../shipping";
import { catalogIndex } from "./helpers/catalogFixture";

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
});
