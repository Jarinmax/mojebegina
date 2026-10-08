// @vitest-environment jsdom
// Peníze stornované objednávky v detailu: nejdřív kontaktovat zákazníka
// (převod se souhlasem / vrácení na jeho žádost), pak zápis vrácení.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CancelledMoneyPanel from "../CancelledMoneyPanel";
import CancelledMoneyBadge from "../CancelledMoneyBadge";

vi.mock("../actions", () => ({
  transferPaymentAction: async () => null,
  requestRefundAction: async () => null,
  recordRefundAction: async () => null,
}));

afterEach(cleanup);

const ORDER = "48596a19-6622-4e65-b0c5-1840b2e6e149";

describe("peníze stornované objednávky", () => {
  it("kontaktovat zákazníka: převod i vrácení jen se souhlasem a poznámkou — žádné „Vrátit peníze“", () => {
    render(<CancelledMoneyPanel orderId={ORDER} money={{ stage: "contact", heldHal: 12900 }} today="2026-10-09" />);
    expect(document.body.textContent).toMatch(/Platba po stornu – kontaktovat zákazníka \(129\sKč\)/);
    expect(screen.getByRole("button", { name: "Převést platbu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Označit k vrácení" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Zapsat vrácení" })).toBeNull();
    const consents = screen.getAllByLabelText("Zákazník s tím souhlasil") as HTMLInputElement[];
    expect(consents).toHaveLength(2);
    expect(consents.every((c) => c.required)).toBe(true);
    expect((document.querySelectorAll('input[name="note"]') as NodeListOf<HTMLInputElement>)[0].required).toBe(true);
  });

  it("zákazník požaduje vrácení: zápis skutečného vrácení s ID transakce, předvyplněná držená částka", () => {
    render(<CancelledMoneyPanel orderId={ORDER} money={{ stage: "refund", heldHal: 12950 }} today="2026-10-09" />);
    expect(document.body.textContent).toMatch(/Vrátit peníze — 129,5\sKč/);
    expect((document.querySelector('input[name="amountKc"]') as HTMLInputElement).value).toBe("129,50");
    expect((document.querySelector('input[name="txId"]') as HTMLInputElement).required).toBe(true);
    expect(screen.queryByRole("button", { name: "Převést platbu" })).toBeNull();
  });

  it("štítky ve výpisu", () => {
    const { rerender } = render(<CancelledMoneyBadge money={{ stage: "contact", heldHal: 1 }} />);
    expect(document.body.textContent).toBe("Platba po stornu – kontaktovat zákazníka");
    rerender(<CancelledMoneyBadge money={{ stage: "refund", heldHal: 1 }} />);
    expect(document.body.textContent).toBe("Vrátit peníze");
    rerender(<CancelledMoneyBadge money={null} />);
    expect(document.body.textContent).toBe("");
  });
});
