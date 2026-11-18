// Stránka Pro kavárny a bistra: texty a formulář „Chci ochutnávku do provozu“.
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { CAFE_BENEFITS, CAFE_CATEGORY_SLUGS, CAFE_SUBTITLE, describeCafeInquiry, normalizeCafePhone, validateCafeInquiry } from "../cafePage";
import { submitCafeInquiry, CAFE_LEAD_SOURCE } from "../cafeInquirySubmit";
import type { EmailMessage } from "../email/resend";
import { createMigratedDb } from "./helpers/migratedDb";

const raw = { venue: "  Kavárna  U Lípy ", name: "Jana Nováková", phone: "+420 777 123 456", email: " Jana@Example.cz ", city: "Kolín", note: "Máme 30 míst." };

describe("Pro kavárny: texty", () => {
  it("žádná zdravotní tvrzení, alkohol se nevydává za rostlinný, výdrž podle e-shopu", () => {
    const all = [CAFE_SUBTITLE, ...CAFE_BENEFITS.flatMap((b) => [b.title, b.text])].join(" ");
    expect(all).not.toMatch(/zdrav|imunit|léč|detox|vitam|koktejl|svařák|alkohol(?!ick)/i);
    expect(all).toContain("Polévky a čaje po otevření vydrží v lednici 14 dní, sirupy 3 měsíce");
    expect(all).toContain("při ceně z e-shopu");
    expect([...CAFE_CATEGORY_SLUGS]).toEqual(["polevky", "sirupy", "caje", "ovocne-napoje", "koktejly"]);
  });
});

describe("Pro kavárny: kontrola formuláře", () => {
  it("srovná mezery a e-mail, město a poznámka jsou nepovinné", () => {
    expect(validateCafeInquiry(raw)).toEqual({ ok: true, value: { venue: "Kavárna U Lípy", name: "Jana Nováková", phone: "+420 777 123 456", email: "jana@example.cz", city: "Kolín", note: "Máme 30 míst." } });
    expect(validateCafeInquiry({ ...raw, city: " ", note: "" })).toMatchObject({ ok: true, value: { city: null, note: null } });
  });
  it("odmítne prázdná a nesmyslná pole s názvem pole", () => {
    expect(validateCafeInquiry({ ...raw, venue: "" })).toMatchObject({ ok: false, field: "venue" });
    expect(validateCafeInquiry({ ...raw, name: "J" })).toMatchObject({ ok: false, field: "name" });
    expect(validateCafeInquiry({ ...raw, phone: "12345" })).toMatchObject({ ok: false, field: "phone" });
    expect(validateCafeInquiry({ ...raw, phone: "zavolejte" })).toMatchObject({ ok: false, field: "phone" });
    expect(validateCafeInquiry({ ...raw, email: "jana@" })).toMatchObject({ ok: false, field: "email" });
    expect(validateCafeInquiry({ ...raw, note: "x".repeat(1001) })).toMatchObject({ ok: false, field: "note" });
    expect(normalizeCafePhone("777123456")).toBe("777123456");
    expect(normalizeCafePhone("00421 903 308 153")).toBe("00421 903 308 153");
  });
  it("text do historie kontaktu", () => {
    const v = validateCafeInquiry(raw);
    expect(v.ok && describeCafeInquiry(v.value, "18. 11. 2026 12:00")).toBe(
      "Formulář „Chci ochutnávku do provozu“ na begina.cz/pro-kavarny vyplněn 18. 11. 2026 12:00.\nProvoz: Kavárna U Lípy\nJméno: Jana Nováková\nTelefon: +420 777 123 456\nE-mail: jana@example.cz\nMěsto: Kolín\nPoznámka: Máme 30 míst."
    );
  });
});

describe("Pro kavárny: odeslání (PGlite)", () => {
  let db: Parameters<typeof submitCafeInquiry>[0];
  const mails: EmailMessage[] = [];
  const options = {
    baseUrl: "https://moje.begina.cz",
    now: new Date("2026-11-18T11:00:00Z"),
    config: { apiKey: "re_x", from: "Begina <info@begina.cz>", replyTo: null, internalTo: ["info@begina.cz"], testRecipients: null } as never,
    transport: async (message: EmailMessage) => {
      mails.push(message);
      return { ok: true as const, id: "m" };
    },
  };

  beforeAll(async () => {
    db = (await createMigratedDb()).db as unknown as Parameters<typeof submitCafeInquiry>[0];
  });

  it("nový zájemce → kontakt v CRM bez vlastníka + upozornění na info@begina.cz", async () => {
    const result = await submitCafeInquiry(db, raw, options);
    expect(result).toMatchObject({ ok: true, outcome: "created", notified: true });
    const leads = await db.execute(sql`SELECT company_name, contact_name, contact_phone, contact_email, city, source, stage, owner_user_id FROM leads`);
    expect(leads.rows).toEqual([
      { company_name: "Kavárna U Lípy", contact_name: "Jana Nováková", contact_phone: "+420 777 123 456", contact_email: "jana@example.cz", city: "Kolín", source: CAFE_LEAD_SOURCE, stage: "new", owner_user_id: null },
    ]);
    const activity = await db.execute(sql`SELECT kind, author_name, body FROM lead_activity`);
    expect(activity.rows).toHaveLength(1);
    expect(activity.rows[0]).toMatchObject({ kind: "created", author_name: "Web – Pro kavárny a bistra (formulář)" });
    expect(String(activity.rows[0].body)).toContain("Provoz: Kavárna U Lípy");
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: ["info@begina.cz"], replyTo: "jana@example.cz", subject: "Zájem o ochutnávku do provozu – Kavárna U Lípy (Kolín)" });
    expect(mails[0].text).toContain(`https://moje.begina.cz/rizeni-firmy/obchod/leady/${result.ok ? result.leadId : ""}`);
  });

  it("stejný telefon znovu → žádný druhý kontakt, jen poznámka", async () => {
    const again = await submitCafeInquiry(db, { ...raw, email: "jiny@example.cz", phone: "777 123 456" }, options);
    expect(again).toMatchObject({ ok: true, outcome: "matched" });
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM leads`)).rows[0].n).toBe(1);
    const kinds = await db.execute(sql`SELECT kind FROM lead_activity ORDER BY created_at`);
    expect(kinds.rows.map((r) => r.kind)).toEqual(["created", "note_added"]);
  });

  it("neplatný vstup nic neuloží ani neposílá", async () => {
    mails.length = 0;
    expect(await submitCafeInquiry(db, { ...raw, phone: "" }, options)).toMatchObject({ ok: false, field: "phone" });
    expect(mails).toEqual([]);
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM leads`)).rows[0].n).toBe(1);
  });
});
