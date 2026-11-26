// Lucie 26. 11. 2026: e-shopová faktura se VYSTAVÍ hned po zaplacení (je vidět
// v Řízení firmy → Faktury), ale zákazníkovi odejde až s expedicí
// („Předáno přepravci“). Skutečná pokladna, zápis platby a „po zaplacení“
// přes ovladač Neonu nad PGlite; e-maily zachytává napodobenina.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { EmailMessage } from "../email/resend";
import type { SendOrderEmailsOptions } from "../email/orderEmails";

vi.mock("server-only", () => ({}));

const ENV = { VERCEL_ENV: "production", IDOKLAD_INVOICING_ENABLED: "manual", ESHOP_BANK_ACCOUNT: "123/0100" };

describe("faktura vystavená po zaplacení, odeslaná s expedicí (neon-http → PGlite)", { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let afterPaid: typeof import("../invoicing/afterPaid");
  let payments: typeof import("../payments");
  let orderId = "";
  let vs = "";
  const mails: EmailMessage[] = [];
   
  const email: Omit<SendOrderEmailsOptions, "invoicePdf"> = {
    config: { apiKey: "re_x", from: "Begina <objednavky@begina.cz>", replyTo: null, internalTo: ["info@begina.cz"], invoiceCopyTo: ["info@begina.cz"], testRecipients: null },
    transport: async (m: EmailMessage) => (mails.push(m), { ok: true as const, id: `m${mails.length}` }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    termsPdf: (async () => ({ filename: "op.pdf", contentBase64: "JVBERi0=" })) as any,
  } as Omit<SendOrderEmailsOptions, "invoicePdf">;

  beforeAll(async () => {
    await import("../../../scripts/eshop-e2e/neon-http-pglite.mjs");
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const schema = await import("@/lib/db/schema");
    db = drizzle(neon("postgresql://u:p@ep-test.neon.tech/neondb"), { schema });
    afterPaid = await import("../invoicing/afterPaid");
    payments = await import("../payments");
    const { validateCheckoutInput } = await import("../checkout");
    const { saveEshopOrder } = await import("../orderWrite");
    const { catalogIndex } = await import("./helpers/catalogFixture");
    await db.execute(sql`INSERT INTO invoice_number_counters (year, last_serial) VALUES (2026, 300) ON CONFLICT (year) DO UPDATE SET last_serial = 300`);
    const checkout = validateCheckoutInput(
      {
        cart: JSON.stringify([{ sku: "kulajda", quantity: 2 }]),
        name: "Jana Nováková",
        email: "jana@example.cz",
        phone: "+420 777 123 456",
        shippingMethodId: "osobni-odber",
        paymentMethodId: "prevod",
        billingStreet: "Prvního pluku 14",
        billingCity: "Praha",
        billingZip: "18600",
        billingCountry: "Česká republika",
        companyPurchase: false,
        billingCompany: "",
        billingIco: "",
        billingDic: "",
        deliverySameAsBilling: true,
        recipientName: "",
        recipientCompany: "",
        recipientPhone: "",
        street: "",
        city: "",
        zip: "",
        note: "",
        termsAccepted: true,
        ageConfirmed: false,
      },
      catalogIndex
    );
    if (!checkout.ok) throw new Error(checkout.error);
    orderId = randomUUID();
    const saved = await saveEshopOrder(db, orderId, checkout.value, {});
    if (!saved.ok) throw new Error(saved.error);
    vs = saved.paymentVs!;
  }, 120_000);

  it("po zaplacení je faktura vystavená, ale zákazník ji ještě nedostal; při expedici odejde jednou", async () => {
    const total = Number((await db.execute(sql`SELECT total_kc FROM orders WHERE id = ${orderId}`)).rows[0].total_kc);
    const result = await payments.recordManualPayment(db, {
      orderId,
      token: randomUUID(),
      method: "bank_transfer",
      amountHal: total * 100,
      occurredAt: new Date(),
      note: null,
      vs,
      user: { userId: "admin-1", name: "Lucie Test" },
    });
    expect(result.settled).toBe(true);
    const paid = await afterPaid.invoiceAndNotifyPaid(db, orderId, "payment_marked_paid", "https://begina.cz", undefined, { env: ENV, email });
    expect(paid.invoice?.status).toBe("issued");

    const inv = (await db.execute(sql`SELECT invoice_number, pdf_sent_at FROM invoices WHERE order_id = ${orderId} AND document_type = 'invoice' AND doc_state = 'issued'`)).rows[0];
    expect(inv.invoice_number).toBe("20260301");
    expect(inv.pdf_sent_at).toBeNull();
    // e-mail o platbě bez PDF faktury
    const customerMails = mails.filter((m) => m.to.includes("jana@example.cz"));
    expect(customerMails.some((m) => (m.attachments ?? []).some((a) => a.contentType === "application/pdf" && /faktur/i.test(a.filename)))).toBe(false);

    // nezaplacená expedice zatím nic: stav ještě není „odesláno“
    expect(await afterPaid.sendInvoiceOnDispatch(db, orderId, "https://begina.cz", { env: ENV, email })).toEqual({ status: "not_dispatched" });

    await db.execute(sql`UPDATE orders SET fulfillment_status = 'handed_to_carrier' WHERE id = ${orderId}`);
    const before = mails.length;
    const sent = await afterPaid.sendInvoiceOnDispatch(db, orderId, "https://begina.cz", { env: ENV, email });
    expect(sent).toEqual({ status: "sent", invoiceNumber: "20260301" });
    expect(mails.length).toBeGreaterThan(before);
    expect(await afterPaid.sendInvoiceOnDispatch(db, orderId, "https://begina.cz", { env: ENV, email })).toEqual({ status: "already_sent" });
  });
});
