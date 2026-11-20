// Partnerský program — měsíční vyhodnocení, kódy, schválení a rozesílka.
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { buildPartnerEmail, crossedIndividualLimit, evaluatePartnerMonth, partnerEntitlementCode, tierFor, type PartnerOrderRow } from "../partnerMonthly";
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

  it("vnitřní řádek s nárokem: měsíc platnosti a procento", () => {
    expect(partnerEntitlementCode({ year: 2026, month: 12 }, 5)).toBe("partner-2026-12-5");
    expect(partnerEntitlementCode({ year: 2027, month: 3 }, 7.5)).toBe("partner-2027-03-7_5");
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

  it("e-mail klientovi: částka, procento, platnost, sleva automaticky, označení a možnost odmítnout", () => {
    const mail = buildPartnerEmail({ salutation: "paní Nováková", evaluatedMonth: NOV, goodsKc: 9842, percent: 5 });
    expect(mail.subject).toBe("Vaše partnerská sleva na prosinec (obchodní sdělení)");
    expect(mail.text).toContain("Dobrý den, paní Nováková,");
    expect(mail.text).toContain("v listopadu");
    expect(mail.text).toContain("9 842 Kč");
    expect(mail.text).toContain("slevou 5 %");
    expect(mail.text).toContain("od 1. do 31. prosince");
    expect(mail.text).toContain("sleva se Vám z ceny zboží odečte automaticky");
    expect(mail.text).not.toContain("Uplatnit");
    expect(mail.text).not.toContain("PROSINEC");
    expect(mail.text).toContain("S přátelským pozdravem\ntým Begina\n+420 774 199 975\ninfo@begina.cz\nwww.begina.cz");
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
    // listopad: tři klienti z e-shopu + říjnová platba a neuhrazená objednávka, které se nepočítají
    await db.execute(sql`INSERT INTO orders (id, channel, contact_email, contact_name, billing_ico, billing_company, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, paid_at, payment_vs) VALUES
      ('a1111111-1111-4111-8111-111111111111', 'eshop', 'Majitel@kavarna.cz', 'Jana', '12345678', 'Kavárna s.r.o.', 9500, 500, 267, 9267, 'paid', 'delivered', '2026-11-05T10:00:00Z', '2026-11-05T10:05:00Z', '70000001'),
      ('a2222222-2222-4222-8222-222222222222', 'eshop', 'maly@example.cz', 'Petr Malý', NULL, NULL, 1200, 0, 267, 1467, 'paid', 'delivered', '2026-11-06T10:00:00Z', '2026-11-06T10:05:00Z', '70000002'),
      ('a3333333-3333-4333-8333-333333333333', 'eshop', 'velky@example.cz', 'Velký odběr', NULL, NULL, 26000, 0, 500, 26500, 'paid', 'delivered', '2026-11-07T10:00:00Z', '2026-11-07T10:05:00Z', '70000003'),
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

  it("report v 18:00 jde jen na info@begina.cz, uloží snímek a nic nezapne", async () => {
    const { reportPartnerMonth, loadPartnerMonthState } = await import("../partnerMonthlyServer");
    const result = await reportPartnerMonth(db, new Date("2026-11-30T17:00:00Z"), mailer);
    expect(result).toEqual({ clients: 3, sent: true });
    expect(sentMail.map((m) => m.to)).toEqual([["info@begina.cz"]]);
    expect(sentMail[0].text).toContain("e-maily odejdou automaticky");
    const codes = await db.execute(sql`SELECT code FROM eshop_coupons WHERE is_active`);
    expect(codes.rows).toEqual([]);
    expect((await loadPartnerMonthState(db, { year: 2026, month: 12 })).reported).toEqual({ "email:velky@example.cz": -1, "ico:12345678": 5, "email:maly@example.cz": 0 });
  });

  it("bez schválení po půlnoci: sleva 5 % jen pro e-mail klienta do konce prosince, e-mail s kopií na info; změna po 18:00 nahlášena; individuální čeká", async () => {
    const { approvePartnerMonth, finalizePartnerMonth, loadPartnerMonthState } = await import("../partnerMonthlyServer");
    const { loadCouponContext } = await import("../couponsServer");
    sentMail.length = 0;
    // jako by klient v reportu měl 3 % a do půlnoci přikoupil na 5 %
    await db.execute(sql`UPDATE eshop_coupons SET note = jsonb_set(note::jsonb, '{reported,ico:12345678}', '3')::text WHERE code = 'partner-program-2026-12'`);
    await approvePartnerMonth(db, { evaluatedMonth: NOV, approvedBy: "Lucie", individual: {}, salutations: { "ico:12345678": "paní Kavárníková" }, now: new Date("2026-11-30T18:00:00Z") });
    const result = await finalizePartnerMonth(db, DEC1, mailer);
    expect(result).toMatchObject({ status: "done", codes: ["5 %"], emailed: ["majitel@kavarna.cz"], failed: [], waiting: ["Velký odběr"] });
    const summary = sentMail.find((m) => m.subject.startsWith("Partnerský program: slevy na prosinec"));
    expect(summary?.subject).toContain("změny po 18:00: 1");
    expect(summary?.text).toContain("ZMĚNY PO REPORTU V 18:00");
    expect(summary?.text).toContain("3 % → 5 %");
    const client = sentMail.find((m) => m.to[0] === "majitel@kavarna.cz");
    expect(client?.bcc).toEqual(["info@begina.cz"]);
    expect(client?.text).toContain("Dobrý den, paní Kavárníková,");
    expect(client?.text).toContain("9 000 Kč");
    expect(client?.text).toContain("slevou 5 %");
    expect(sentMail.some((m) => m.to.includes("maly@example.cz") || m.to.includes("velky@example.cz"))).toBe(false);

    // pokladna: e-mail klienta dostane nabídku PARTNER 5 %, cizí e-mail ne; vnitřní řádek nejde zadat jako kód
    const { PARTNER_CODE, partnerPercent } = await import("../coupons");
    const inDecember = new Date("2026-12-10T12:00:00Z");
    const mine = await loadCouponContext(db, [PARTNER_CODE], inDecember, { email: "Majitel@Kavarna.cz" });
    expect(partnerPercent(mine.coupons.get(PARTNER_CODE)!)).toEqual({ ok: true, percent: 5 });
    expect((await loadCouponContext(db, [PARTNER_CODE], inDecember, { email: "cizi@example.cz" })).coupons.has(PARTNER_CODE)).toBe(false);
    expect((await loadCouponContext(db, ["partner-2026-12-5"], inDecember, { email: "cizi@example.cz" })).coupons.size).toBe(0);
    // v lednu už prosincová sleva neplatí
    expect((await loadCouponContext(db, [PARTNER_CODE], new Date("2027-01-05T12:00:00Z"), { email: "majitel@kavarna.cz" })).coupons.has(PARTNER_CODE)).toBe(false);
    const stored = await db.execute(sql`SELECT expires_at FROM eshop_coupons WHERE code = 'partner-2026-12-5'`);
    expect(new Date(stored.rows[0].expires_at as string).toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect((await loadPartnerMonthState(db, { year: 2026, month: 12 })).sent).toEqual(["majitel@kavarna.cz"]);

    // opakovaný běh už nikomu nic neposílá
    sentMail.length = 0;
    const again = await finalizePartnerMonth(db, DEC1, mailer);
    expect(again.emailed).toEqual([]);
    expect(sentMail.every((m) => m.to[0] === "info@begina.cz")).toBe(true);
  });

  it("schválené oslovení se nabídne i v dalších měsících (19. 11. 2026)", async () => {
    const { loadRememberedSalutations } = await import("../partnerMonthlyServer");
    // listopadové vyhodnocení platí v prosinci → lednové vyhodnocení (platnost únor) vidí prosincové oslovení
    expect(await loadRememberedSalutations(db, { year: 2027, month: 2 })).toEqual({ "ico:12345678": "paní Kavárníková" });
    expect(await loadRememberedSalutations(db, { year: 2026, month: 12 })).toEqual({});
  });

  it("doplnění individuální slevy: klient nad 20 000 Kč dostane vlastní procento; odhlášený slevu má, e-mail nedostane", async () => {
    const { addPartnerOptOut, approvePartnerMonth, finalizePartnerMonth } = await import("../partnerMonthlyServer");
    sentMail.length = 0;
    await addPartnerOptOut(db, "Velky@example.cz");
    await approvePartnerMonth(db, { evaluatedMonth: NOV, approvedBy: "Lucie", individual: { "email:velky@example.cz": 10 }, salutations: {}, now: new Date("2026-12-01T08:00:00Z") });
    const result = await finalizePartnerMonth(db, new Date("2026-12-01T08:00:05Z"), mailer);
    expect(result.codes.sort()).toEqual(["10 %", "5 %"]);
    expect(result.emailed).toEqual([]);
    expect(result.waiting).toEqual([]);
    const row = await db.execute(sql`SELECT email_restrictions, amount::int AS amount, is_active FROM eshop_coupons WHERE code = 'partner-2026-12-10'`);
    expect(row.rows[0]).toMatchObject({ email_restrictions: ["velky@example.cz"], amount: 10, is_active: true });
    // stavové řádky nejsou aktivní kódy
    const inactive = await db.execute(sql`SELECT code FROM eshop_coupons WHERE NOT is_active ORDER BY code`);
    expect(inactive.rows.map((r) => r.code)).toEqual(["partner-program-2026-12", "partner-program-odhlaseni"]);
  });
});
