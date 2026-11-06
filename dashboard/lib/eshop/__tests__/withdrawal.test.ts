// Online odstoupení od smlouvy (§ 1830a OZ, zákon č. 159/2026 Sb.):
// tlačítka, povinné údaje, potvrzení e-mailem s obsahem a datem a časem.
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { formatSubmittedAt, orderNumberFrom, validateWithdrawal, WITHDRAW_BUTTON_LABEL, WITHDRAW_CONFIRM_LABEL } from "../withdrawal";
import type { EmailMessage } from "../email/resend";

describe("odstoupení — pravidla", () => {
  it("zákonné popisky tlačítek", () => {
    expect(WITHDRAW_BUTTON_LABEL).toBe("Odstoupit od smlouvy");
    expect(WITHDRAW_CONFIRM_LABEL).toBe("Potvrdit odstoupení od smlouvy");
  });

  it("povinné jen jméno, e-mail a údaje o smlouvě; ostatní nepovinné", () => {
    expect(validateWithdrawal({ name: "Jana Nováková", email: "Jana@Example.cz", contract: "9260010" })).toEqual({
      ok: true,
      value: { name: "Jana Nováková", email: "jana@example.cz", contract: "9260010", items: "", note: "" },
    });
    expect(validateWithdrawal({ name: "", email: "jana@example.cz", contract: "9260010" })).toMatchObject({ ok: false, field: "name" });
    expect(validateWithdrawal({ name: "Jana", email: "nespravny", contract: "9260010" })).toMatchObject({ ok: false, field: "email" });
    expect(validateWithdrawal({ name: "Jana", email: "jana@example.cz", contract: "" })).toMatchObject({ ok: false, field: "contract" });
  });

  it("číslo objednávky z volného textu; datum a čas odeslání v Praze", () => {
    expect(orderNumberFrom("objednávka č. 9260010 ze 3. 11.")).toBe(9260010);
    expect(orderNumberFrom("kulajda z minulého týdne")).toBeNull();
    expect(formatSubmittedAt(new Date("2026-11-06T21:41:05Z")).replaceAll(" ", " ")).toBe("6. 11. 2026 v 22:41:05");
  });
});

describe("odstoupení — odeslání: záznam k objednávce a potvrzení přijetí e-mailem", { timeout: 60_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  const ORDER_ID = "8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const config = { apiKey: "re_test", from: "Begina <obchod@begina.cz>", replyTo: "info@begina.cz", internalTo: ["info@begina.cz"], testRecipients: null };

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    await db.execute(sql`INSERT INTO orders (id, order_number, channel, contact_email, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, payment_vs)
                         VALUES (${ORDER_ID}, 9260077, 'eshop', 'Jana@Example.cz', 758, 0, 99, 857, 'paid', 'delivered', '9260077')`);
  }, 60_000);

  it("potvrzení zákazníkovi (obsah prohlášení + datum a čas), upozornění Begině, záznam k nalezené objednávce", async () => {
    const { submitWithdrawal } = await import("../withdrawalSubmit");
    const sent: { message: EmailMessage; key: string }[] = [];
    const now = new Date("2026-11-06T21:41:05Z");
    const result = await submitWithdrawal(
      db,
      { name: "Jana Nováková", email: "jana@example.cz", contract: "9260077", items: "1× Kulajda", note: "" },
      { now, baseUrl: "https://begina.cz", config, transport: async (message, key) => (sent.push({ message, key }), { ok: true, id: "x" }) }
    );
    expect(result).toMatchObject({ ok: true, orderFound: true });
    expect(sent).toHaveLength(2);
    const ack = sent[0].message;
    expect(ack.to).toEqual(["jana@example.cz"]);
    expect(ack.subject).toBe("Potvrzení přijetí odstoupení od smlouvy");
    const text = ack.text.replaceAll(" ", " ");
    expect(text).toContain("Potvrzujeme, že jsme 6. 11. 2026 v 22:41:05 přijali vaše odstoupení od kupní smlouvy.");
    expect(text).toContain("Jméno a příjmení: Jana Nováková");
    expect(text).toContain("Objednávka / údaje o smlouvě: 9260077");
    expect(text).toContain("Vracené zboží: 1× Kulajda");
    expect(text).toContain("Odesláno: 6. 11. 2026 v 22:41:05 (čas v ČR)");
    expect(text).toContain("Vitice 119, 281 06 Vitice (okr. Kolín)");
    expect(sent[1].message.to).toEqual(["info@begina.cz"]);
    expect(sent[1].message.text).toContain("https://begina.cz/rizeni-firmy/objednavky/" + ORDER_ID);
    const rows = (await db.execute(sql`SELECT kind, metadata->>'submittedAt' AS at FROM order_activity WHERE order_id = ${ORDER_ID}`)).rows;
    expect(rows).toEqual([{ kind: "withdrawal_requested", at: "2026-11-06T21:41:05.000Z" }]);
  });

  it("cizí e-mail objednávku neoznačí; bez e-mailové služby srozumitelná chyba s náhradní cestou", async () => {
    const { submitWithdrawal } = await import("../withdrawalSubmit");
    const ok = await submitWithdrawal(
      db,
      { name: "Petr", email: "petr@example.cz", contract: "9260077" },
      { baseUrl: "https://begina.cz", config, transport: async () => ({ ok: true, id: "x" }) }
    );
    expect(ok).toMatchObject({ ok: true, orderFound: false });
    expect(await submitWithdrawal(db, { name: "Petr", email: "petr@example.cz", contract: "9260077" }, { baseUrl: "x", config: null })).toEqual({
      ok: false,
      error: "Odstoupení se teď nepodařilo odeslat. Zkuste to prosím za chvíli znovu, nebo nám ho napište na info@begina.cz — platí stejně.",
    });
  });
});
