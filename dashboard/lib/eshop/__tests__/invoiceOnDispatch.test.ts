// Faktura zákazníkovi až s expedicí (rozhodnutí Lucie 18. 11. 2026).
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { sendInvoiceOnDispatch, DISPATCH_ACTOR, type DispatchInvoiceDeps } from "../invoicing/afterPaid";
import { createMigratedDb } from "./helpers/migratedDb";

type Db = Parameters<typeof sendInvoiceOnDispatch>[0];
const ORG = "e0000000-0000-4000-8000-000000000001";
const id = (n: number) => `e${n}111111-1111-4111-8111-111111111111`;

describe("faktura při expedici (PGlite)", () => {
  let db: Db;
  const calls: string[] = [];
  const deps = (result: Awaited<ReturnType<NonNullable<DispatchInvoiceDeps["issueAndSend"]>>>): DispatchInvoiceDeps => ({
    issueAndSend: async (_db, orderId, _baseUrl, actor) => {
      expect(actor).toEqual(DISPATCH_ACTOR);
      calls.push(orderId);
      return result;
    },
  });
  const sent = deps({ status: "issued", invoiceNumber: "9260009", externalId: "1", adopted: false, pdf: null, emailed: true });

  beforeAll(async () => {
    const created = await createMigratedDb();
    db = created.db as unknown as Db;
    await created.db.execute(sql`INSERT INTO organizations (id, ico, name, registered_address) VALUES (${ORG}, '00000019', 'Firma', '-')`);
    await created.db.execute(sql`INSERT INTO orders (id, channel, buyer_organization_id, contact_email, contact_name, subtotal_kc, discount_kc, shipping_kc, total_kc, payment_status, fulfillment_status, ordered_at, payment_vs) VALUES
      (${id(1)}, 'eshop', NULL, 'a@example.cz', 'A', 100, 0, 0, 100, 'paid', 'handed_to_carrier', now(), '70000101'),
      (${id(2)}, 'eshop', NULL, 'b@example.cz', 'B', 100, 0, 0, 100, 'paid', 'ready', now(), '70000102'),
      (${id(3)}, 'eshop', NULL, 'c@example.cz', 'C', 100, 0, 0, 100, 'unpaid', 'out_for_delivery', now(), '70000103'),
      (${id(4)}, 'manual', ${ORG}, 'd@example.cz', 'D', 100, 0, 0, 100, 'paid', 'delivered', now(), '70000104'),
      (${id(5)}, 'eshop', NULL, 'e@example.cz', 'E', 100, 0, 0, 100, 'paid', 'delivered', now(), '70000105')`);
  });

  it("zaplacená e-shopová objednávka předaná dopravci → vystavit a odeslat", async () => {
    expect(await sendInvoiceOnDispatch(db, id(1), "https://x", sent)).toEqual({ status: "sent", invoiceNumber: "9260009" });
    expect(calls).toEqual([id(1)]);
  });

  it("nic neposílá: ještě neexpedovaná, nezaplacená, ruční objednávka, neznámá objednávka", async () => {
    calls.length = 0;
    expect(await sendInvoiceOnDispatch(db, id(2), "https://x", sent)).toEqual({ status: "not_dispatched" });
    expect(await sendInvoiceOnDispatch(db, id(3), "https://x", sent)).toEqual({ status: "not_paid" });
    // ruční objednávka: se starým iDokladem nic; s vlastní fakturací ji řeší ownManual.test.ts
    expect(await sendInvoiceOnDispatch(db, id(4), "https://x", { ...sent, env: { INVOICING_PROVIDER: "idoklad" } })).toEqual({ status: "not_eshop" });
    expect(await sendInvoiceOnDispatch(db, "e9111111-1111-4111-8111-111111111111", "https://x", sent)).toEqual({ status: "not_eshop" });
    expect(calls).toEqual([]);
  });

  it("vystavení selže nebo e-mail neodejde → důvod, žádná výjimka", async () => {
    expect(await sendInvoiceOnDispatch(db, id(5), "https://x", deps({ status: "failed", error: "iDoklad neodpovídá", externalId: null }))).toEqual({ status: "not_sent", reason: "iDoklad neodpovídá" });
    expect(await sendInvoiceOnDispatch(db, id(5), "https://x", deps({ status: "skipped", reason: "Fakturační adresa je v zemi Slovensko" }))).toEqual({ status: "not_sent", reason: "Fakturační adresa je v zemi Slovensko" });
    expect(await sendInvoiceOnDispatch(db, id(5), "https://x", deps({ status: "already_issued", invoiceNumber: "9260010" }))).toEqual({ status: "not_sent", reason: "fakturu se nepodařilo odeslat e-mailem", invoiceNumber: "9260010" });
    const boom: DispatchInvoiceDeps = { issueAndSend: async () => { throw new Error("pád"); } };
    expect(await sendInvoiceOnDispatch(db, id(5), "https://x", boom)).toMatchObject({ status: "not_sent" });
  });
});
