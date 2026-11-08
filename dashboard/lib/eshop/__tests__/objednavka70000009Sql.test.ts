// docs/eshop-production/73_objednavka_70000009_fakturacni_udaje_MAIN.sql nad
// PGlite: doplní fakturační údaje a vazbu na kartu, NEZMĚNÍ platbu ani částky,
// nevystaví fakturu; s jiným e-mailem nebo podruhé se zastaví a nic nezmění.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDb } from "./helpers/migratedDb";

const ROOT = path.join(__dirname, "../../..");
const RAW = readFileSync(path.join(ROOT, "docs/eshop-production/73_objednavka_70000009_fakturacni_udaje_MAIN.sql"), "utf8").replace(
  "IS DISTINCT FROM '70a96b3677653646e65343cae8e27182'",
  "IS NOT NULL AND false"
);
const ORG = "bd1e09a1-ed86-4327-ab56-163e5e7486f5";
const ORDER = "6a2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b";

describe("73: objednávka 70000009 — fakturační údaje z ověřených faktur", { timeout: 120_000 }, () => {
  let pg: PGlite;
  let script: string;

  beforeEach(async () => {
    ({ pg } = await createMigratedDb());
    await pg.exec(`
      INSERT INTO organizations (id, ico, name, registered_address, status) VALUES ('${ORG}', '74797921', 'Cukrárna Kavárna Adélka (Lenka Odrazilová)', 'Dlouhá 113, 254 01 Radlík-Jílové', 'Zákazník Begina');
      INSERT INTO user_profiles (user_id, name, email) VALUES ('u-adelka', 'Lenka', 'kavarna@example.cz');
      INSERT INTO organization_memberships (user_id, organization_id, role) VALUES ('u-adelka', '${ORG}', 'owner');
      INSERT INTO orders (id, order_number, channel, contact_name, contact_email, recipient_name, recipient_address, shipping_method_code, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs)
      VALUES ('${ORDER}', 70000009, 'eshop', 'Lenka Odrazilová', 'Kavarna@Example.cz', 'Lenka Odrazilová', 'Matúškova 831/1, 149 00 Praha 4-Háje', 'rozvoz', 7085, 0, 99, 7184, 'unpaid', 'new', '2026-11-08T12:44:08Z', '70000009');
    `);
    const { rows } = await pg.query<{ n: number }>(`SELECT order_number AS n FROM orders WHERE id = '${ORDER}'`);
    expect(Number(rows[0].n)).toBe(70000009);
    script = RAW;
  }, 120_000);

  it("doplní údaje a kartu, platba a částky beze změny", async () => {
    await pg.exec(script);
    const { rows } = await pg.query<Record<string, unknown>>(`SELECT * FROM orders WHERE id = '${ORDER}'`);
    expect(rows[0]).toMatchObject({
      buyer_organization_id: ORG,
      billing_name: "Lenka Odrazilová",
      billing_company: "Lenka Odrazilová",
      billing_ico: "74797921",
      billing_dic: "CZ7557210705",
      billing_street: "Dlouhá 113",
      billing_city: "Jílové u Prahy",
      billing_zip: "254 01",
      billing_country: "Česká republika",
      recipient_company: "Cukrárna Kavárna Adélka",
      delivery_same_as_billing: false,
      payment_status: "unpaid",
      total_kc: 7184,
      payment_vs: "70000009",
    });
    const org = await pg.query<{ dic: string }>(`SELECT dic FROM organizations WHERE id = '${ORG}'`);
    expect(org.rows[0].dic).toBe("CZ7557210705");
    const invoices = await pg.query(`SELECT 1 FROM invoices`);
    expect(invoices.rows).toEqual([]);
    const activity = await pg.query<{ kind: string }>(`SELECT kind FROM order_activity WHERE order_id = '${ORDER}'`);
    expect(activity.rows.map((r) => r.kind)).toEqual(["billing_details_completed"]);
    // podruhé: pojistka
    await expect(pg.exec(script)).rejects.toThrow(/nesedí/);
  });

  it("jiný e-mail než vlastník karty → zastaví se, nic nezmění", async () => {
    await pg.exec(`UPDATE orders SET contact_email = 'cizi@example.cz' WHERE id = '${ORDER}'`);
    await expect(pg.exec(script)).rejects.toThrow(/nesedí/);
    await pg.exec("ROLLBACK");
    const { rows } = await pg.query<{ b: string | null; o: string | null }>(`SELECT billing_ico AS b, buyer_organization_id AS o FROM orders WHERE id = '${ORDER}'`);
    expect(rows[0]).toEqual({ b: null, o: null });
  });
});
