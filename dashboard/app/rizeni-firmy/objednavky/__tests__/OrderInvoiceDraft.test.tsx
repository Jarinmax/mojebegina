// @vitest-environment jsdom
// ESHOP 1.0 — blok „Faktura (iDoklad)“ v detailu objednávky: režim návrhu,
// problémy, co by se odeslalo do iDokladu, přegenerování.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import OrderInvoiceDraft from "../OrderInvoiceDraft";
import { buildInvoiceDraft } from "@/lib/eshop/invoicing/draft";
import { IDOKLAD_ISSUE_STEPS, idokladRequests } from "@/lib/eshop/invoicing/idoklad";
import type { OrderInvoiceView } from "@/lib/eshop/invoicing/service";

vi.mock("../actions", () => ({ prepareInvoiceDraftAction: async () => null }));

afterEach(cleanup);

function invoiceView(recipientAddress: string | null): OrderInvoiceView {
  const { draft, problems } = buildInvoiceDraft(
    {
      id: "c2ca5147-74a9-4e6f-b6c8-5275fa93ed33",
      channel: "eshop",
      orderNumber: 900008,
      paymentVs: "70000001",
      contactName: "Jana Nováková",
      contactEmail: "jana@example.cz",
      contactPhone: null,
      recipientAddress,
      shippingMethodLabel: "Osobní vyzvednutí",
      subtotalKc: 379,
      discountKc: 0,
      shippingKc: 0,
      totalKc: 379,
      paidAt: null,
    },
    [{ name: "Dýňová polévka", quantity: 1, unitPriceKc: 379, lineTotalKc: 379, sku: "dynova-polevka" }],
    [{ id: "p1", source: "manual", externalId: "tok-1", method: "bank_transfer", direction: "inflow", status: "succeeded", amountHal: 37900, occurredAt: new Date("2026-10-06T08:00:00Z") }],
    { numberSeriesId: null }
  );
  return {
    invoiceId: "i1",
    docState: "draft",
    invoiceNumber: null,
    issuedAt: null,
    totalKc: 379,
    paymentVs: "70000001",
    createdAt: new Date(),
    link: {
      provider: "idoklad",
      state: "dry_run",
      numberSeries: null,
      externalId: null,
      externalNumber: null,
      lastError: null,
      attempts: 0,
      updatedAt: new Date(),
      payload: {
        version: 1,
        mode: "dry_run",
        modeReason: "Testovací provoz (Preview): do iDokladu se nikdy nic neodesílá.",
        generatedAt: "2026-10-06T08:00:01.000Z",
        draft,
        problems,
        idoklad: idokladRequests(draft),
        steps: IDOKLAD_ISSUE_STEPS,
      },
    },
  };
}

describe("faktura v detailu objednávky — režim návrhu", () => {
  it("bez návrhu: nezaplaceno = vysvětlení, zaplaceno = tlačítko", () => {
    render(<OrderInvoiceDraft orderId="o1" invoice={null} paid={false} />);
    expect(screen.getByText(/vznikne automaticky po úplném zaplacení/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    render(<OrderInvoiceDraft orderId="o1" invoice={null} paid />);
    expect(screen.getByRole("button", { name: "Vytvořit návrh faktury" })).toBeTruthy();
  });

  it("návrh: režim, odběratel, VS, položky, problémy, data pro iDoklad, přegenerování", () => {
    const { container } = render(<OrderInvoiceDraft orderId="o1" invoice={invoiceView(null)} paid />);
    const text = container.textContent ?? "";
    expect(text).toContain("Režim návrhu — do iDokladu se nic neodesílá");
    expect(text).toContain("Jana Nováková");
    expect(text).toContain("70000001");
    expect(text).toContain("1× Dýňová polévka");
    expect(text).toContain("6. 10. 2026 / 6. 10. 2026 / 6. 10. 2026");
    expect(text).toContain("e-shopová řada — ID zatím nepotvrzené");
    expect(text).toContain("Zákazník nezadal adresu (osobní odběr)"); // upozornění
    expect(text).toContain("Chybí ID e-shopové číselné řady v iDokladu"); // doplnit před ostrým vystavením
    expect(text).toContain("VariableSymbol~eq~70000001"); // pojistka proti dvojí faktuře
    expect(text).toContain('"NumericSequenceId": null');
    expect(screen.getByRole("button", { name: "Přegenerovat návrh z aktuálních údajů" })).toBeTruthy();
  });

  it("vystavená faktura se přegenerovat nedá", () => {
    const issued = invoiceView("Lipová 5, 60200 Brno");
    issued.docState = "issued";
    issued.link!.state = "issued";
    render(<OrderInvoiceDraft orderId="o1" invoice={issued} paid />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Lipová 5, 60200/)).toBeTruthy();
  });
});
