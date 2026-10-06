// ESHOP 1.0 — návrh faktury (lib/eshop/invoicing): čisté sestavení
// návrhu, převod pro iDoklad a režim (vždy jen návrh). Uložení do DB
// a napojení na platby ověřuje transferPayment.test.ts.
import { describe, expect, it } from "vitest";
import { blockingProblems, buildInvoiceDraft, parseCheckoutAddress, type DraftOrder, type DraftPayment } from "../invoicing/draft";
import { idokladRequests } from "../invoicing/idoklad";
import { LIVE_INVOICING_IMPLEMENTED, invoiceNumberSeriesId, invoicingMode } from "../invoicing/mode";

const ORDER: DraftOrder = {
  id: "c2ca5147-74a9-4e6f-b6c8-5275fa93ed33",
  channel: "eshop",
  orderNumber: 900008,
  paymentVs: "70000001",
  contactName: "Jana Nováková",
  contactEmail: " Jana@Example.cz ",
  contactPhone: "+420 777 123 456",
  recipientAddress: "Prvního pluku 14, 186 00 Praha",
  shippingMethodLabel: "Chlazená přeprava",
  subtotalKc: 758,
  discountKc: 0,
  shippingKc: 99,
  totalKc: 857,
  paidAt: new Date("2026-10-06T08:00:00Z"),
};
const ITEMS = [{ name: "Kulajda", quantity: 2, unitPriceKc: 379, lineTotalKc: 758, sku: "kulajda" }];
const pay = (over: Partial<DraftPayment> = {}): DraftPayment => ({
  id: "p1",
  source: "manual",
  externalId: "tok-1",
  method: "bank_transfer",
  direction: "inflow",
  status: "succeeded",
  amountHal: 85700,
  occurredAt: new Date("2026-10-05T22:30:00Z"), // 6. 10. 0:30 v Praze
  ...over,
});
const CONFIG = { numberSeriesId: null };

describe("návrh faktury — sestavení", () => {
  it("zákazník, položky + doprava, celkem, VS, data v pražském čase, vazba na platby", () => {
    const { draft, problems } = buildInvoiceDraft(ORDER, ITEMS, [pay()], CONFIG);
    expect(draft).toMatchObject({
      orderId: ORDER.id,
      orderNumber: 900008,
      vs: "70000001",
      customer: {
        kind: "person",
        name: "Jana Nováková",
        email: "jana@example.cz",
        address: { street: "Prvního pluku 14", zip: "18600", city: "Praha", country: "CZ" },
      },
      totalKc: 857,
      vatMode: "non_payer",
      issueDate: "2026-10-06",
      taxableDate: "2026-10-06",
      dueDate: "2026-10-06",
      paymentMethod: "bank_transfer",
      paidHal: 85700,
      numberSeriesId: null,
      payments: [{ id: "p1", source: "manual", externalId: "tok-1", amountHal: 85700 }],
    });
    expect(draft.lines).toEqual([
      { kind: "item", name: "Kulajda", sku: "kulajda", quantity: 2, unitPriceKc: 379, totalKc: 758 },
      { kind: "shipping", name: "Doprava: Chlazená přeprava", sku: null, quantity: 1, unitPriceKc: 99, totalKc: 99 },
    ]);
    // v režimu návrhu nic neblokuje; chybějící číselná řada blokuje jen ostré vystavení
    expect(blockingProblems(problems, "dry_run")).toEqual([]);
    expect(blockingProblems(problems, "live").map((p) => p.code)).toEqual(["no_number_series", "verify_idoklad_fields"]);
  });

  it("sleva jako záporný řádek; součet řádků = celkem objednávky", () => {
    const discounted = { ...ORDER, discountKc: 50, totalKc: 807 };
    const { draft, problems } = buildInvoiceDraft(discounted, ITEMS, [pay({ amountHal: 80700 })], CONFIG);
    expect(draft.lines.at(-1)).toEqual({ kind: "discount", name: "Sleva", sku: null, quantity: 1, unitPriceKc: -50, totalKc: -50 });
    expect(problems.filter((p) => p.severity === "error")).toEqual([]);
  });

  it("chyby v datech: nesedící součet, neuhrazeno celé, bez VS, jména a e-mailu", () => {
    const bad = { ...ORDER, paymentVs: null, contactName: " ", contactEmail: null, totalKc: 900 };
    const { problems } = buildInvoiceDraft(bad, ITEMS, [pay({ amountHal: 10000 })], CONFIG);
    expect(problems.filter((p) => p.severity === "error").map((p) => p.code)).toEqual([
      "total_mismatch",
      "not_fully_paid",
      "no_vs",
      "no_customer_name",
      "no_customer_email",
    ]);
  });

  it("pokusy, neúspěšné a nahrazené platby se nepočítají; proběhlá vratka se odečte", () => {
    const { draft } = buildInvoiceDraft(
      ORDER,
      ITEMS,
      [
        pay({ id: "a", status: "pending", source: "stripe", method: "card" }),
        pay({ id: "b", status: "failed", source: "stripe", method: "card" }),
        pay({ id: "c", status: "superseded" }),
        pay({ id: "d" }),
        pay({ id: "e", amountHal: 1000, occurredAt: new Date("2026-10-06T09:00:00Z") }),
        pay({ id: "f", direction: "outflow", amountHal: 1000 }),
      ],
      CONFIG
    );
    expect(draft.payments.map((p) => p.id)).toEqual(["d", "e"]);
    expect(draft.paidHal).toBe(85700);
  });

  it("osobní odběr bez adresy = jen upozornění; nerozpoznaná adresa = upozornění", () => {
    const pickup = buildInvoiceDraft({ ...ORDER, recipientAddress: null }, ITEMS, [pay()], CONFIG);
    expect(pickup.draft.customer.address).toBeNull();
    expect(pickup.problems.find((p) => p.code === "no_address")?.severity).toBe("warning");
    const odd = buildInvoiceDraft({ ...ORDER, recipientAddress: "někde u lesa" }, ITEMS, [pay()], CONFIG);
    expect(odd.problems.find((p) => p.code === "address_unparsed")?.severity).toBe("warning");
  });

  it("s potvrzenou číselnou řadou problém „no_number_series“ zmizí", () => {
    const { problems, draft } = buildInvoiceDraft(ORDER, ITEMS, [pay()], { numberSeriesId: "12345" });
    expect(draft.numberSeriesId).toBe("12345");
    expect(problems.map((p) => p.code)).not.toContain("no_number_series");
  });

  it("adresa z pokladny → ulice, PSČ, město", () => {
    expect(parseCheckoutAddress("Mostecká 273/21, 118 00 Praha 1")).toEqual({ street: "Mostecká 273/21", zip: "11800", city: "Praha 1", country: "CZ" });
    expect(parseCheckoutAddress("Lipová 5, 60200 Brno")).toEqual({ street: "Lipová 5", zip: "60200", city: "Brno", country: "CZ" });
    expect(parseCheckoutAddress(null)).toBeNull();
    expect(parseCheckoutAddress("Brno")).toBeNull();
  });
});

describe("návrh faktury — data pro iDoklad (nic se neodesílá)", () => {
  it("kontakt podle e-mailu, pojistka podle VS, faktura s položkami a daty", () => {
    const { draft } = buildInvoiceDraft(ORDER, ITEMS, [pay()], { numberSeriesId: "12345" });
    const req = idokladRequests(draft);
    expect(req.contactLookup).toEqual({ by: "email", value: "jana@example.cz" });
    expect(req.contact).toMatchObject({ CompanyName: "Jana Nováková", Firstname: "Jana", Surname: "Nováková", PostalCode: "18600" });
    expect(req.duplicateCheck).toEqual({ collection: "IssuedInvoices", filter: "VariableSymbol~eq~70000001" });
    expect(req.invoice).toMatchObject({
      NumericSequenceId: "12345",
      VariableSymbol: "70000001",
      DateOfIssue: "2026-10-06",
      DateOfTaxing: "2026-10-06",
      DateOfMaturity: "2026-10-06",
      OrderNumber: "900008",
      IsEet: false,
    });
    expect(req.invoice.Items).toEqual([
      { Name: "Kulajda", Code: "kulajda", Amount: 2, Unit: "ks", UnitPrice: 379, PriceType: "OnlyBase", VatRateType: "Zero" },
      { Name: "Doprava: Chlazená přeprava", Code: null, Amount: 1, Unit: null, UnitPrice: 99, PriceType: "OnlyBase", VatRateType: "Zero" },
    ]);
  });
});

describe("režim fakturace", () => {
  it("vždy jen návrh — Preview, Production i Production se zapnutým přepínačem", () => {
    expect(LIVE_INVOICING_IMPLEMENTED).toBe(false);
    for (const env of [{}, { VERCEL_ENV: "preview", IDOKLAD_INVOICING_ENABLED: "on" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "production", IDOKLAD_INVOICING_ENABLED: "on" }]) {
      expect(invoicingMode(env).mode).toBe("dry_run");
    }
    expect(invoicingMode({ VERCEL_ENV: "preview" }).reason).toMatch(/nikdy nic neodesílá/);
  });

  it("ID číselné řady jen z IDOKLAD_ESHOP_SEQUENCE_ID", () => {
    expect(invoiceNumberSeriesId({})).toBeNull();
    expect(invoiceNumberSeriesId({ IDOKLAD_ESHOP_SEQUENCE_ID: "  " })).toBeNull();
    expect(invoiceNumberSeriesId({ IDOKLAD_ESHOP_SEQUENCE_ID: " 42 " })).toBe("42");
  });
});
