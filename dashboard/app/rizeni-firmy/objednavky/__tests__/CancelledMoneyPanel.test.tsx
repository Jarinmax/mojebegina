// @vitest-environment jsdom
// Peníze stornované objednávky v detailu: nejdřív kontaktovat zákazníka
// (převod se souhlasem / vrácení na jeho žádost), pak zápis vrácení.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CancelledMoneyPanel from "../CancelledMoneyPanel";
import CancelledMoneyBadge from "../CancelledMoneyBadge";
import { fireEvent } from "@testing-library/react";

const REPLACEMENT = {
  token: "0b9d3a52-5d55-4a8a-9d55-6f7c0e3a1b11",
  heldHal: 75800,
  customer: { name: "Jana Nováková", email: "jana@example.cz", phone: "+420 777 123 456" },
  address: { street: "", city: "", zip: "" },
  products: [
    { sku: "kulajda", label: "Kulajda — 1 l", priceKc: 379, ageRestricted: false },
    { sku: "svarak-deluxe-500ml", label: "Svařák Deluxe — 500 ml", priceKc: 129, ageRestricted: true },
  ],
  shipping: [
    { id: "osobni-odber", label: "Osobní vyzvednutí", priceKc: 0, requiresAddress: false },
    { id: "rozvoz", label: "Chlazená přeprava", priceKc: 99, requiresAddress: true },
  ],
};

vi.mock("../actions", () => ({
  createReplacementAction: async () => null,
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

  it("náhradní objednávka: údaje zákazníka, průběžná cena a rozdíl, 18+ jen u alkoholu, souhlas povinný", () => {
    render(<CancelledMoneyPanel orderId={ORDER} money={{ stage: "contact", heldHal: 75800 }} today="2026-10-09" replacement={REPLACEMENT} />);
    expect(document.body.textContent).toContain("Jana Nováková · jana@example.cz");
    const first = screen.getByLabelText("Produkt 1") as HTMLSelectElement;
    fireEvent.change(first, { target: { value: "kulajda" } });
    fireEvent.change(screen.getByLabelText("Počet 1"), { target: { value: "3" } });
    expect(document.body.textContent).toMatch(/zákazník doplatí 379\sKč/);
    expect(screen.queryByLabelText(/starší 18 let/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Počet 1"), { target: { value: "1" } });
    expect(document.body.textContent).toMatch(/přeplatek 379\sKč bude k vrácení/);
    fireEvent.change(screen.getByLabelText("Produkt 2"), { target: { value: "svarak-deluxe-500ml" } });
    expect((screen.getByLabelText(/starší 18 let/) as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText("Zákazník s náhradní objednávkou souhlasil") as HTMLInputElement).required).toBe(true);
    // adresa jen u přepravy
    expect(document.querySelector('input[name="street"]')).toBeNull();
    fireEvent.change(screen.getByLabelText("Doprava"), { target: { value: "rozvoz" } });
    expect((document.querySelector('input[name="street"]') as HTMLInputElement).required).toBe(true);
  });

  it("přeplatek: závazek k vrácení a zápis skutečného vrácení", () => {
    render(<CancelledMoneyPanel orderId={ORDER} money={{ stage: "overpaid", heldHal: 37900 }} today="2026-10-09" />);
    expect(document.body.textContent).toMatch(/Přeplatek k vrácení — 379\sKč/);
    expect(document.body.textContent).toContain("Do té doby je veden jako závazek, ne jako vrácené peníze.");
    expect(screen.getByRole("button", { name: "Zapsat vrácení" })).toBeTruthy();
  });

  it("štítky ve výpisu", () => {
    const { rerender } = render(<CancelledMoneyBadge money={{ stage: "contact", heldHal: 1 }} />);
    expect(document.body.textContent).toBe("Platba po stornu – kontaktovat zákazníka");
    rerender(<CancelledMoneyBadge money={{ stage: "refund", heldHal: 1 }} />);
    expect(document.body.textContent).toBe("Vrátit peníze");
    rerender(<CancelledMoneyBadge money={{ stage: "overpaid", heldHal: 1 }} />);
    expect(document.body.textContent).toBe("Přeplatek k vrácení");
    rerender(<CancelledMoneyBadge money={null} />);
    expect(document.body.textContent).toBe("");
  });
});
