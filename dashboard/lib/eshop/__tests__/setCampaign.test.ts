// Kampaň Ochutnávkový set (zadání Lucie 17. 11. 2026): kód OCHUTNAVKA50,
// e-mail s kódem, provize pro Josefa a přehledy.
import { describe, expect, it, vi } from "vitest";
import { evaluateCoupons, type Coupon } from "../coupons";
import { buildCommission, commissionEmail, couponEmail, laterCommissionHalere, previousMonth, returningPercent, saturdayEmail, setOrderSource, sourceCounts } from "../setCampaign";
import { SET_CAMPAIGN_SKU, SET_COUPON_CODE, SET_SLUG } from "../tastingSet";
import type { CatalogIndex } from "../catalogIndex";
import type { PricedLine } from "../pricing";

vi.mock("server-only", () => ({}));

const COUPON: Coupon = {
  code: SET_COUPON_CODE,
  discountType: "fixed_cart",
  amount: 50,
  freeShipping: false,
  expiresAt: new Date("2027-03-31T21:59:59Z"),
  minimumAmountKc: 199,
  maximumAmountKc: null,
  individualUse: true,
  productSlugs: [],
  excludedProductSlugs: [SET_SLUG],
  categorySlugs: [],
  excludedCategorySlugs: [],
  emailRestrictions: [],
  usageLimit: null,
  usageLimitPerUser: 1,
  limitUsageToXItems: null,
};
const SLUGS: Record<string, string> = { [SET_CAMPAIGN_SKU]: SET_SLUG, "lipovy-sirup-650ml": "lipovy-sirup", "dynova-3l": "dynova-polevka" };
const index = { getVariant: (sku: string) => (SLUGS[sku] ? { product: { slug: SLUGS[sku], category: "sirupy" }, variant: { sku } } : undefined) } as unknown as CatalogIndex;
const line = (sku: string, unitPriceKc: number, quantity = 1): PricedLine => ({ sku, name: sku, quantity, unitPriceKc, lineTotalKc: unitPriceKc * quantity });

function run(lines: PricedLine[], extra: { codes?: string[]; email?: string | null; used?: number; now?: Date } = {}) {
  const other: Coupon = { ...COUPON, code: "sleva10", discountType: "percent", amount: 10, individualUse: false, minimumAmountKc: null, excludedProductSlugs: [], usageLimitPerUser: null };
  return evaluateCoupons(extra.codes ?? [SET_COUPON_CODE], {
    lines,
    subtotalKc: lines.reduce((sum, l) => sum + l.lineTotalKc, 0),
    index,
    coupons: new Map([[SET_COUPON_CODE, COUPON], ["sleva10", other]]),
    usage: new Map([[SET_COUPON_CODE, { total: extra.used ?? 0, byEmail: new Map(extra.used ? [["jana@example.cz", extra.used]] : []) }]]),
    email: extra.email ?? null,
    now: extra.now ?? new Date("2026-12-10T12:00:00Z"),
  });
}

describe("kód OCHUTNAVKA50", () => {
  it("dá 50 Kč na zboží od 199 Kč", () => {
    const result = run([line("lipovy-sirup-650ml", 199)]);
    expect(result).toMatchObject({ ok: true, discountKc: 50 });
  });

  it("set se do minima 199 Kč nezapočítá a sleva se na něj nevztahuje", () => {
    const alone = run([line(SET_CAMPAIGN_SKU, 189, 2)]);
    expect(alone.ok).toBe(false);
    const short = run([line(SET_CAMPAIGN_SKU, 189), line("lipovy-sirup-650ml", 150)]);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toContain("bez ochutnávkového setu");
    const enough = run([line(SET_CAMPAIGN_SKU, 189), line("dynova-3l", 499)]);
    expect(enough).toMatchObject({ ok: true, discountKc: 50 });
  });

  it("jednou na zákazníka, do 31. 3. 2027 a nejde kombinovat", () => {
    const again = run([line("dynova-3l", 499)], { email: "jana@example.cz", used: 1 });
    expect(again.ok).toBe(false);
    const expired = run([line("dynova-3l", 499)], { now: new Date("2027-04-01T08:00:00Z") });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error).toContain("31. 3. 2027");
    const combined = run([line("dynova-3l", 499)], { codes: [SET_COUPON_CODE, "sleva10"] });
    expect(combined.ok).toBe(false);
    if (!combined.ok) expect(combined.error).toContain("nelze kombinovat");
  });
});

describe("e-mail s kódem", () => {
  it("oslovuje příjmením, nese kód, podmínky, podpis a zákonnou patičku s odhlášením", () => {
    const email = couponEmail({ customerName: "Jana Nováková", shopUrl: "https://begina.cz", optoutUrl: "https://begina.cz/odhlaseni/x" });
    expect(email.subject).toBe("Sleva 50 Kč na váš další nákup");
    expect(email.text.startsWith("Dobrý den, paní Nováková,")).toBe(true);
    for (const part of ["OCHUTNAVKA50", "od 199 Kč", "31. 3. 2027", "Nelze ho kombinovat", "S přátelským pozdravem", "tým Begina", "Obchodní sdělení", "IČO 74337297", "https://begina.cz/odhlaseni/x"]) {
      expect(email.text).toContain(part);
      expect(email.html).toContain(part);
    }
  });
});

describe("provize pro Josefa", () => {
  it("3 Kč za set + 5 % z dalších nákupů na haléře, měsíční součet na celé koruny", () => {
    expect(laterCommissionHalere(199)).toBe(995);
    const report = buildCommission("2026-12", 37, [
      { number: "1201", paidAt: new Date("2026-12-05T10:00:00Z"), goodsKc: 199 },
      { number: "1210", paidAt: new Date("2026-12-09T10:00:00Z"), goodsKc: 548 },
    ]);
    expect(report.setsHalere).toBe(11100);
    expect(report.laterHalere).toBe(995 + 2740);
    expect(report.totalKc).toBe(148); // 111 + 37,35 = 148,35
    const email = commissionEmail(report);
    expect(email.subject).toBe("Provize Josef za prosinec 2026: 148 Kč");
    expect(email.text).toContain("37 ks × 3 Kč = 111,00 Kč");
    expect(email.text).toContain("objednávka 1201: 199 Kč → 9,95 Kč");
  });

  it("minulý měsíc k prvnímu dni v měsíci", () => {
    expect(previousMonth("2027-01-01")).toBe("2026-12");
    expect(previousMonth("2026-12-01")).toBe("2026-11");
  });
});

describe("sobotní přehled", () => {
  it("ukáže sety, zbývající kusy, použití kódu a podíl vracejících se", () => {
    const stats = { setsTotal: 42, setsWeek: 12, campaignSold: 40, couponUses: 7, campaignCustomers: 30, returningCustomers: 6 };
    expect(returningPercent(stats)).toBe(20);
    expect(returningPercent({ campaignCustomers: 0, returningCustomers: 0 })).toBeNull();
    const email = saturdayEmail(stats);
    expect(email.subject).toBe("Kampaň set: 12 setů za týden, zbývá 60 ze 100");
    expect(email.text).toContain("Použití kódu OCHUTNAVKA50: 7×");
    expect(email.text).toContain("znovu nakoupilo 6 (20 %)");
  });
});

describe("zdroj objednávky setu", () => {
  const ordered = new Date("2026-11-28T08:32:14Z");
  it("proklik z Meta do 7 dní = Facebook / Instagram", () => {
    expect(setOrderSource({ fbc: "fb.1.1795854542318.IwY2xjaw", fbp: "fb.1.1.2" }, ordered)).toBe("meta");
  });
  it("starý proklik nebo žádný = odjinud", () => {
    expect(setOrderSource({ fbc: "fb.1.1790000000000.abc", fbp: "x" }, ordered)).toBe("jinde");
    expect(setOrderSource({ fbc: null, fbp: "fb.1.1.2" }, ordered)).toBe("jinde");
  });
  it("bez souhlasu = neznámo", () => {
    expect(setOrderSource(null, ordered)).toBe("neznamo");
  });
  it("počty", () => {
    expect(sourceCounts([{ source: "meta" }, { source: "meta" }, { source: "neznamo" }])).toEqual({ meta: 2, jinde: 0, neznamo: 1 });
  });
});
