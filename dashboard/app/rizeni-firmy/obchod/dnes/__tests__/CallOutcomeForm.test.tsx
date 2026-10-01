// @vitest-environment jsdom
//
// Security Phase 19 — regrese na to, že výsledek hovoru NENÍ obchodní fáze:
// formulář musí mít samostatné povinné "Výsledek hovoru" (bez "beze změny")
// a nepovinnou "Posunout fázi na" s výchozí "Fázi neměnit". Datum dalšího
// kontaktu se stává povinným (`required`) jen po výběru výsledku "Zavolat
// později".
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import CallOutcomeForm from "../CallOutcomeForm";

vi.mock("../actions", () => ({
  logDailyCallOutcomeAction: async () => null,
}));

afterEach(() => {
  cleanup();
});

describe("CallOutcomeForm — Security Phase 19", () => {
  it("ve sbaleném stavu ukáže jen tlačítko 'Zapsat výsledek'", () => {
    render(<CallOutcomeForm itemId="item-1" />);
    expect(screen.getByText("Zapsat výsledek")).toBeTruthy();
    expect(screen.queryByLabelText("Výsledek hovoru")).toBeNull();
  });

  it("po rozbalení má select 'Výsledek hovoru' placeholder jako disabled option, ne validní volbu", () => {
    render(<CallOutcomeForm itemId="item-1" />);
    fireEvent.click(screen.getByText("Zapsat výsledek"));

    const select = screen.getByLabelText("Výsledek hovoru") as HTMLSelectElement;
    const placeholder = Array.from(select.options).find((o) => o.value === "");
    expect(placeholder?.disabled).toBe(true);
  });

  it("posun fáze má výchozí volbu 'Fázi neměnit' s prázdnou hodnotou", () => {
    render(<CallOutcomeForm itemId="item-1" />);
    fireEvent.click(screen.getByText("Zapsat výsledek"));

    const select = screen.getByLabelText("Posunout fázi na") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByText("Fázi neměnit")).toBeTruthy();
  });

  it("datum dalšího kontaktu není required, dokud není vybráno 'Zavolat později'", () => {
    render(<CallOutcomeForm itemId="item-1" />);
    fireEvent.click(screen.getByText("Zapsat výsledek"));

    const dateInput = screen.getByLabelText(/^Další kontakt/) as HTMLInputElement;
    expect(dateInput.required).toBe(false);
  });

  it("po výběru výsledku 'Zavolat později' se datum stane required", () => {
    render(<CallOutcomeForm itemId="item-1" />);
    fireEvent.click(screen.getByText("Zapsat výsledek"));

    const resultSelect = screen.getByLabelText("Výsledek hovoru") as HTMLSelectElement;
    fireEvent.change(resultSelect, { target: { value: "call_back_later" } });

    const dateInput = screen.getByLabelText(/^Další kontakt/) as HTMLInputElement;
    expect(dateInput.required).toBe(true);
  });
});
