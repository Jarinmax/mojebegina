// @vitest-environment jsdom
// Chyba z první Production objednávky (8. 10. 2026): po uložení „Stornovaná“
// ukazoval výběr dál „V přípravě/výrobě“ — <select> s defaultValue si novou
// výchozí hodnotu po obnovení stránky nevezme. Formulář musí vždy ukázat
// stav z DB a jednoznačně potvrdit uložení.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import FulfillmentStatusForm from "../FulfillmentStatusForm";
import PaymentStatusForm from "../PaymentStatusForm";

const calls = vi.hoisted(() => ({ fulfillment: [] as FormData[], result: null as unknown }));
vi.mock("../actions", () => ({
  updateFulfillmentStatusAction: async (_orderId: string, _prev: unknown, formData: FormData) => {
    calls.fulfillment.push(formData);
    return calls.result;
  },
  updatePaymentStatusAction: async () => null,
}));

afterEach(() => {
  cleanup();
  calls.fulfillment.length = 0;
  vi.restoreAllMocks();
});

const ORDER = "48596a19-6622-4e65-b0c5-1840b2e6e149";
const select = () => screen.getByLabelText("Stav objednávky") as HTMLSelectElement;

describe("Stav objednávky — formulář ukazuje skutečný stav", () => {
  it("po obnovení stránky s novým stavem z DB ukáže výběr nový stav (dřív zůstal starý)", () => {
    const { rerender, container } = render(<FulfillmentStatusForm orderId={ORDER} currentStatus="preparing" />);
    expect(select().value).toBe("preparing");
    rerender(<FulfillmentStatusForm orderId={ORDER} currentStatus="cancelled" />);
    expect(select().value).toBe("cancelled");
    expect((container.querySelector('input[name="expectedStatus"]') as HTMLInputElement).value).toBe("cancelled");
    // i reset formuláře (React 19 ho dělá po odeslání) vrátí stav z DB
    act(() => (container.querySelector("form") as HTMLFormElement).reset());
    expect(select().value).toBe("cancelled");
  });

  it("platba (ruční objednávky): stejně", () => {
    const { rerender } = render(<PaymentStatusForm orderId={ORDER} currentStatus="unpaid" />);
    rerender(<PaymentStatusForm orderId={ORDER} currentStatus="paid" />);
    expect((screen.getByLabelText("Stav platby") as HTMLSelectElement).value).toBe("paid");
  });

  it("po uložení ukáže potvrzení; formulář posílá i stav, ze kterého uživatel vycházel", async () => {
    calls.result = { success: "Uloženo — stav objednávky je „Stornovaná“." };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<FulfillmentStatusForm orderId={ORDER} currentStatus="preparing" emailsCustomer />);
    fireEvent.change(select(), { target: { value: "cancelled" } });
    await act(async () => fireEvent.submit(select().form!));
    expect(window.confirm).toHaveBeenCalledWith("Stornovat objednávku? Zákazníkovi odejde e-mail o zrušení.");
    expect(calls.fulfillment).toHaveLength(1);
    expect(calls.fulfillment[0].get("status")).toBe("cancelled");
    expect(calls.fulfillment[0].get("expectedStatus")).toBe("preparing");
    expect(screen.getByRole("status").textContent).toBe("Uloženo — stav objednávky je „Stornovaná“.");
  });

  it("storno bez potvrzení dialogu se neodešle", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<FulfillmentStatusForm orderId={ORDER} currentStatus="new" />);
    fireEvent.change(select(), { target: { value: "cancelled" } });
    await act(async () => fireEvent.submit(select().form!));
    expect(calls.fulfillment).toHaveLength(0);
  });

  it("chyba (např. souběžná změna) se ukáže červeně", async () => {
    calls.result = { error: "Stav objednávky mezitím změnil někdo jiný na „Doručená“." };
    render(<FulfillmentStatusForm orderId={ORDER} currentStatus="new" />);
    fireEvent.change(select(), { target: { value: "confirmed" } });
    await act(async () => fireEvent.submit(select().form!));
    expect(screen.getByRole("alert").textContent).toMatch(/mezitím změnil/);
  });
});
