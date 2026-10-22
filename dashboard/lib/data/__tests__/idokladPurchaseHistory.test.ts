import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

import { createFakeIdoklad } from "@/lib/eshop/__tests__/helpers/fakeIdoklad";

const ENV = {
  IDOKLAD_ESHOP_CLIENT_ID: "client",
  IDOKLAD_ESHOP_CLIENT_SECRET: "secret",
  IDOKLAD_ESHOP_APPLICATION_ID: "application",
};

let loadIdokladPurchaseHistory: typeof import("../idokladPurchaseHistory").loadIdokladPurchaseHistory;

beforeAll(async () => {
  ({ loadIdokladPurchaseHistory } = await import("../idokladPurchaseHistory"));
});

describe("historie nákupů z iDokladu", () => {
  it("načte všechny faktury kontaktu, seřadí je a zachová stav úhrady", async () => {
    const fake = createFakeIdoklad({
      contacts: [
        {
          Id: 21183734,
          Email: "milankasparek@gmail.com",
          CompanyName: "Milan Kašpárek",
          IdentificationNumber: "76043894",
        },
      ],
    });
    fake.invoices.push(
      {
        Id: 101,
        DocumentNumber: "20250001",
        VariableSymbol: "20250001",
        NumericSequenceId: 1,
        PartnerId: 21183734,
        PaymentStatus: 1,
        Prices: { TotalWithVat: 379, TotalVat: 0, TotalPaid: 379 },
        body: { DateOfIssue: "2025-05-28T12:00:00.000" },
      },
      {
        Id: 102,
        DocumentNumber: "20260192",
        VariableSymbol: "20260192",
        NumericSequenceId: 1,
        PartnerId: 21183734,
        PaymentStatus: 0,
        Prices: { TotalWithVat: 758, TotalVat: 0, TotalPaid: 0 },
        body: { DateOfIssue: "2026-10-22T12:00:00.000" },
      }
    );

    const result = await loadIdokladPurchaseHistory("76043894", {
      env: ENV,
      fetchImpl: fake.fetchImpl,
    });

    expect(result).toHaveLength(2);
    expect(result.map((invoice) => [invoice.orderNumber, invoice.status, invoice.totalKc])).toEqual([
      ["Faktura č. 20260192", "Neuhrazeno", 758],
      ["Faktura č. 20250001", "Uhrazeno", 379],
    ]);
    expect(fake.calls.filter((call) => call.path === "/IssuedInvoices/101")).toHaveLength(1);
    expect(fake.calls.filter((call) => call.path === "/IssuedInvoices/102")).toHaveLength(1);
    expect(fake.writes()).toEqual([]);
  });

  it("bez přístupových údajů nevolá iDoklad", async () => {
    const fake = createFakeIdoklad();
    await expect(
      loadIdokladPurchaseHistory("76043894", { env: {}, fetchImpl: fake.fetchImpl })
    ).resolves.toEqual([]);
    expect(fake.calls).toEqual([]);
  });
});
