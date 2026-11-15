// Partnerský program — měsíční vyhodnocení, kódy, schválení a rozesílka.
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { buildPartnerEmail, crossedIndividualLimit, evaluatePartnerMonth, partnerCode, tierFor, type PartnerOrderRow } from "../partnerMonthly";
import type { EmailMessage } from "../email/resend";
import { createMigratedDb } from "./helpers/migratedDb";

const NOV = { year: 2026, month: 11 };
const row = (over: Partial<PartnerOrderRow>): PartnerOrderRow => ({
  orderNumber: 1,
  paidAt: new Date("2026-11-10T10:00:00Z"),
  goodsKc: 1000,
  totalKc: 1267,
  email: "a@firma.cz",
  ico: null,
  company: null,
  name: "Anna",
  ...over,
});

describe("partnerský program: čistá logika", () => {
  it("úrovně: hranice patří nižší úrovni (nad 5 000 = 5 001 a víc)", () => {
    expect(tierFor(5000).percent).toBe(0);
    expect(tierFor(5001).percent).toBe(3);
    expect(tierFor(8000).percent).toBe(3);
    expect(tierFor(8001).percent).toBe(5);
    expect(tierFor(12001).percent).toBe(7);
    expect(tierFor(20000).percent).toBe(7);
    expect(tierFor(20001).percent).toBeNull();
  });

  it("kód = měsíc platnosti bez diakritiky + procento", () => {
    expect(partnerCode({ year: 2026, month: 12 }, 5)).toBe("PROSINEC5");
    expect(partnerCode({ year: 2027, month: 3 }, 3)).toBe("BREZEN3");
    expect(partnerCode({ year: 2027, month: 9 }, 7)).toBe("ZARI7");
  });

  it("jeden klient = IČO, jinak e-mail; dva e-maily jedné firmy se sečtou", () => {
    const clients = evaluatePartnerMonth([
      row({ ico: "12345678", company: "Kavárna s.r.o.", email: "majitel@kavarna.cz", goodsKc: 5000, totalKc: 5267 }),
      row({ ico: "12345678", company: "Kavárna s.r.o.", email: "Provozni@kavarna.cz", goodsKc: 4000, totalKc: 4267 }),
      row({ email: "a@firma.cz", goodsKc: 1000 }),
      row({ email: null, ico: null }),
    ]);
    expect(clients).toHaveLength(2);
    expect(clients[0]).toMatchObject({ key: "ico:12345678", name: "Kavárna s.r.o.", emails: ["majitel@kavarna.cz", "provozni@kavarna.cz"], orders: 2, goodsKc: 9000, totalKc: 9534, percent: 5 });
    expect(clients[1]).toMatchObject({ key: "email:a@firma.cz", percent: 0 });
  });

  it("e-mail klientovi: částka, procento, kód, platnost, označení a možnost odmítnout", () => {
    const mail = buildPartnerEmail({ salutation: "paní Nováková", evaluatedMonth: NOV, goodsKc: 9842, percent: 5 });
    expect(mail.subject).toBe("Vaše partnerská sleva na prosinec (obchodní sdělení)");
    expect(mail.text).toContain("Dobrý den, paní Nováková,");
    expect(mail.text).toContain("v listopadu");
    expect(mail.text).toContain("9 842 Kč");
    expect(mail.text).toContain("slevou 5 %");
    expect(mail.text).toContain("od 1. do 31. prosince");
    expect(mail.text).toContain("PROSINEC5");
    expect(mail.text).toContain("Tým Begina");
    expect(mail.text).toContain("IČO 74337297");
    expect(mail.text).toContain("slovem NE");
    expect(buildPartnerEmail({ evaluatedMonth: NOV, goodsKc: 6000, percent: 3 }).text.startsWith("Dobrý den,\n")).toBe(true);
  });

  it("upozornění na 20 000 Kč: jen kdo hranici přesáhl za poslední den", () => {
    const rows = [
      row({ email: "velky@firma.cz", goodsKc: 15000, paidAt: new Date("2026-11-05T10:00:00Z") }),
      row({ email: "velky@firma.cz", goodsKc: 6000, paidAt: new Date("2026-11-20T10:00:00Z") }),
      row({ email: "davno@firma.cz", goodsKc: 25000, paidAt: new Date("2026-11-03T10:00:00Z") }),
    ];
    expect(crossedIndividualLimit(rows, new Date("2026-11-19T17:00:00Z")).map((c) => c.key)).toEqual(["email:velky@firma.cz"]);
    expect(crossedIndividualLimit(rows, new Date("2026-11-21T17:00:00Z"))).toEqual([]);
  });
});

describe("partnerský program: schválení, kódy a rozesílka (PGlite)", () => {
  let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];
  const sentMail: EmailMessage[] = [];
  const mailer = {
    config: { apiKey: "re_test", from: "Begina <info@begina.cz>", replyTo: "info@begina.cz", internalTo: ["info@begina.cz"], invoiceCopyTo: ["info@begina.cz"], testRecipients: null },
    transport: async (message: EmailMessage) => {
      sentMail.push(message);
      return { ok: true as const, id: "x" };
    },
  };
  const DEC1 = new Date("2026-11-30T23:05:00Z"); // 1. 12. 0:05 v Praze

  beforeAll(async () => {
    ({ db } = await createMigratedDb());
    // listopad: tři klienti z e-shopu + ruční objednávka a říjnová platba, které se nepočítají
    await db.execute(sql`INSERT INTO orders (id, channel, contact_email, contact_name, billing_ico, billing_company, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, paid_at, payment_vs) VALUES
      ('a1111111-1111-4111-8111-111111111111', 'eshop', 'Majitel@kavarna.cz', 'Jana', '12345678', 'Kavárna s.r.o.', 9500, 500, 267, 9267, 'paid', 'delivered', '2026-11-05T10:00:00Z', '2026-11-05T10:05:00Z', '70000001'),
      ('a2222222-2222-4222-8222-222222222222', 'eshop', 'maly@example.cz', 'Petr Malý', NULL, NULL, 1200, 0, 267, 1467, 'paid', 'delivered', '2026-11-06T10:00:00Z', '2026-11-06T10:05:00Z', '70000002'),
      ('a3333333-3333-4333-8333-333333333333', 'eshop', 'velky@example.cz', 'Velký odběr', NULL, NULL, 26000, 0, 500, 26500, 'paid', 'delivered', '2026-11-07T10:00:00Z', '2026-11-07T10:05:00Z', '70000003'),
      ('a4444444-4444-4444-8444-444444444444', 'manual', 'maly@example.cz', 'Petr Malý', NULL, NULL, 30000, 0, 0, 30000, 'paid', 'delivered', '2026-11-08T10:00:00Z', '2026-11-08T10:05:00Z', NULL),
      ('a5555555-5555-4555-8555-555555555555', 'eshop', 'maly@example.cz', 'Petr Malý', NULL, NULL, 9000, 0, 267, 9267, 'paid', 'delivered', '2026-10-29T10:00:00Z', '2026-10-30T10:05:00Z', '70000005'),
      ('a6666666-6666-4666-8666-666666666666', 'eshop', 'maly@example.cz', 'Petr Malý', NULL, NULL, 9000, 0, 267, 9267, 'unpaid', 'new', '2026-11-09T10:00:00Z', NULL, '70000006')`);
  });

  it("vyhodnocení bere jen uhrazené e-shopové objednávky zaplacené v měsíci", async () => {
    const { loadPartnerMonthOverview } = await import("../partnerMonthlyServer");
    const overview = await loadPartnerMonthOverview(db, NOV);
    expect(overview.clients.map((c) => [c.key, c.goodsKc, c.percent])).toEqual([
      ["email:velky@example.cz", 26000, null],
      ["ico:12345678", 9000, 5],
      ["email:maly@example.cz", 1200, 0],
    ]);
    expect(overview.state.approvedAt).toBeNull();
  });

  it("bez schválení se nezaloží kódy a klientům nic neodejde", async () => {
    const { finalizePartnerMonth } = await import("../partnerMonthlyServer");
    const result = await finalizePartnerMonth(db, DEC1, mailer);
    expect(result.status).toBe("not-approved");
    expect(sentMail.map((m) => m.to)).toEqual([["info@begina.cz"]]);
    const codes = await db.execute(sql`SELECT code FROM eshop_coupons WHERE is_active`);
    expect(codes.rows).toEqual([]);
  });

  it("po schválení: kód PROSINEC5 jen pro e-mail klienta do konce prosince, e-mail s kopií na info; individuální čeká", async () => {
    const { approvePartnerMonth, finalizePartnerMonth, loadPartnerMonthState } = await import("../partnerMonthlyServer");
    const { loadCouponContext } = await import("../couponsServer");
    sentMail.length = 0;
    await approvePartnerMonth(db, { evaluatedMonth: NOV, approvedBy: "Lucie", individual: {}, salutations: { "ico:12345678": "paní Kavárníková" }, now: new Date("2026-11-30T18:00:00Z") });
    const result = await finalizePartnerMonth(db, DEC1, mailer);
    expect(result).toMatchObject({ status: "done", codes: ["PROSINEC5"], emailed: ["majitel@kavarna.cz"], failed: [], waiting: ["Velký odběr"] });
    const client = sentMail.find((m) => m.to[0] === "majitel@kavarna.cz");
    expect(client?.bcc).toEqual(["info@begina.cz"]);
    expect(client?.text).toContain("Dobrý den, paní Kavárníková,");
    expect(client?.text).toContain("9 000 Kč");
    expect(client?.text).toContain("PROSINEC5");
    expect(sentMail.some((m) => m.to.includes("maly@example.cz") || m.to.includes("velky@example.cz"))).toBe(false);

    const ctx = await loadCouponContext(db, ["prosinec5"], new Date("2026-12-10T12:00:00Z"));
    expect(ctx.coupons.get("prosinec5")).toMatchObject({ discountType: "percent", amount: 5, emailRestrictions: ["majitel@kavarna.cz"] });
    expect(ctx.coupons.get("prosinec5")!.expiresAt!.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect((await loadPartnerMonthState(db, { year: 2026, month: 12 })).sent).toEqual(["majitel@kavarna.cz"]);

    // opakovaný běh už nikomu nic neposílá
    sentMail.length = 0;
    const again = await finalizePartnerMonth(db, DEC1, mailer);
    expect(again.emailed).toEqual([]);
    expect(sentMail.every((m) => m.to[0] === "info@begina.cz")).toBe(true);
  });

  it("doplnění individuální slevy: klient nad 20 000 Kč dostane vlastní kód; odhlášený kód dostane, e-mail ne", async () => {
    const { addPartnerOptOut, approvePartnerMonth, finalizePartnerMonth } = await import("../partnerMonthlyServer");
    sentMail.length = 0;
    await addPartnerOptOut(db, "Velky@example.cz");
    await approvePartnerMonth(db, { evaluatedMonth: NOV, approvedBy: "Lucie", individual: { "email:velky@example.cz": 10 }, salutations: {}, now: new Date("2026-12-01T08:00:00Z") });
    const result = await finalizePartnerMonth(db, new Date("2026-12-01T08:00:05Z"), mailer);
    expect(result.codes.sort()).toEqual(["PROSINEC10", "PROSINEC5"]);
    expect(result.emailed).toEqual([]);
    expect(result.waiting).toEqual([]);
    const row = await db.execute(sql`SELECT email_restrictions, amount::int AS amount, is_active FROM eshop_coupons WHERE code = 'prosinec10'`);
    expect(row.rows[0]).toMatchObject({ email_restrictions: ["velky@example.cz"], amount: 10, is_active: true });
    // stavové řádky nejsou aktivní kódy
    const inactive = await db.execute(sql`SELECT code FROM eshop_coupons WHERE NOT is_active ORDER BY code`);
    expect(inactive.rows.map((r) => r.code)).toEqual(["partner-program-2026-12", "partner-program-odhlaseni"]);
  });
});
