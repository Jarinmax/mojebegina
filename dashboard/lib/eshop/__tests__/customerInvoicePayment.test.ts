import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createFakeIdoklad } from "./helpers/fakeIdoklad";

const READ_ENV = {
  IDOKLAD_ESHOP_CLIENT_ID: "client",
  IDOKLAD_ESHOP_CLIENT_SECRET: "secret",
  IDOKLAD_ESHOP_APPLICATION_ID: "application",
};
const LIVE_ENV = {
  ...READ_ENV,
  VERCEL_ENV: "production",
  IDOKLAD_INVOICING_ENABLED: "manual",
  IDOKLAD_ESHOP_SEQUENCE_ID: "7277293",
};

let loadCustomerInvoiceByIco: typeof import("../invoicing/customerInvoicePayment").loadCustomerInvoiceByIco;
let settleCustomerInvoice: typeof import("../invoicing/customerInvoicePayment").settleCustomerInvoice;

beforeAll(async () => {
  ({ loadCustomerInvoiceByIco, settleCustomerInvoice } = await import("../invoicing/customerInvoicePayment"));
});

function fixture() {
  const fake = createFakeIdoklad({
    contacts: [
      { Id: 801, Email: "milan@example.cz", CompanyName: "Milan", IdentificationNumber: "76043894" },
      { Id: 802, Email: "jiny@example.cz", CompanyName: "Jiný", IdentificationNumber: "12345679" },
    ],
  });
  fake.invoices.push({
    Id: 901,
    DocumentNumber: "20260192",
    VariableSymbol: "20260192",
    NumericSequenceId: 1,
    PartnerId: 801,
    PaymentStatus: 0,
    Prices: { TotalWithVat: 758, TotalVat: 0, TotalPaid: 0 },
    body: { DateOfIssue: "2026-10-22T12:00:00.000" },
  });
  return fake;
}

describe("platba historické faktury zákazníkem", () => {
  it("zpřístupní fakturu jen organizaci se shodným IČO", async () => {
    const fake = fixture();
    const own = await loadCustomerInvoiceByIco(901, "76043894", { env: READ_ENV, fetchImpl: fake.fetchImpl });
    const foreign = await loadCustomerInvoiceByIco(901, "12345679", { env: READ_ENV, fetchImpl: fake.fetchImpl });
    expect(own).toMatchObject({ id: 901, partnerId: 801, documentNumber: "20260192", amountDueKc: 758, paid: false });
    expect(foreign).toBeNull();
    expect(fake.writes()).toEqual([]);
  });

  it("nezapíše úhradu při jiné částce", async () => {
    const fake = fixture();
    await expect(
      settleCustomerInvoice({ invoiceId: 901, partnerId: 801, amountHal: 70000 }, { env: LIVE_ENV, fetchImpl: fake.fetchImpl })
    ).resolves.toBe("amount-mismatch");
    expect(fake.writes()).toEqual([]);
  });

  it("po přesné platbě označí fakturu v iDokladu a stav znovu ověří", async () => {
    const fake = fixture();
    await expect(
      settleCustomerInvoice({ invoiceId: 901, partnerId: 801, amountHal: 75800 }, { env: LIVE_ENV, fetchImpl: fake.fetchImpl })
    ).resolves.toBe("paid");
    expect(fake.writes()).toEqual(["PUT /IssuedDocumentPayments/FullyPay/901"]);
    expect(fake.invoices[0].PaymentStatus).toBe(1);
  });
});
