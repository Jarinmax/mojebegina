// @vitest-environment jsdom
//
// Security Phase 19 — regrese na to, že výsledek hovoru NENÍ obchodní fáze:
// formulář musí mít samostatné povinné "Výsledek hovoru" (bez "beze změny")
// a nepovinnou "Posunout fázi na" s výchozí "Fázi neměnit". Datum dalšího
// kontaktu se stává povinným (`required`) jen po výběru výsledku "Zavolat
// později".
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import CallOutcomeForm from "../CallOutcomeForm";
import { DailyCallOutcomeContext } from "../DailyCallOutcomeContext";
import type { LogCallOutcomeActionState } from "../actions";

const mockAction = vi.fn<
  (itemId: string, prevState: LogCallOutcomeActionState, formData: FormData) => Promise<LogCallOutcomeActionState>
>(async () => ({ status: "idle" }));

vi.mock("../actions", () => ({
  logDailyCallOutcomeAction: (itemId: string, prevState: LogCallOutcomeActionState, formData: FormData) =>
    mockAction(itemId, prevState, formData),
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

  it("po výběru výsledku 'Zavolat později' se datum i čas stanou required", () => {
    render(<CallOutcomeForm itemId="item-1" />);
    fireEvent.click(screen.getByText("Zapsat výsledek"));

    const resultSelect = screen.getByLabelText("Výsledek hovoru") as HTMLSelectElement;
    fireEvent.change(resultSelect, { target: { value: "call_back_later" } });

    const dateInput = screen.getByLabelText(/^Další kontakt/) as HTMLInputElement;
    expect(dateInput.required).toBe(true);
    const timeInput = screen.getByLabelText("Čas dalšího kontaktu") as HTMLInputElement;
    expect(timeInput.required).toBe(true);
  });
});

// Security Phase 21 (Denní volání 1.1) — bod 3 schváleného zadání: úspěch
// se musí oznámit NAHORU přes Context (notifySaved), ne vykreslit lokálně
// — tahle komponenta i karta kolem ní totiž po úspěchu zmizí ze
// serverových dat.
describe("CallOutcomeForm — oznámení úspěchu přes Context (Security Phase 21)", () => {
  it("po úspěšném uložení zavolá notifySaved s itemId a uloženou poznámkou, ne lokální success text", async () => {
    mockAction.mockResolvedValueOnce({
      status: "saved",
      itemId: "item-1",
      note: "Dovoláno, pošlu nabídku.",
      resultLabel: "Dovoláno – zájem",
      nextFollowUpAtLabel: null,
    });
    const notifySaved = vi.fn();

    render(
      <DailyCallOutcomeContext.Provider value={{ notifySaved, highlightId: null, registerRef: () => {} }}>
        <CallOutcomeForm itemId="item-1" />
      </DailyCallOutcomeContext.Provider>
    );

    fireEvent.click(screen.getByText("Zapsat výsledek"));
    fireEvent.change(screen.getByLabelText("Výsledek hovoru"), { target: { value: "reached_interested" } });
    fireEvent.change(screen.getByPlaceholderText("Co bylo domluveno…"), {
      target: { value: "Dovoláno, pošlu nabídku." },
    });
    fireEvent.click(screen.getByText("Uložit výsledek"));

    await waitFor(() => expect(notifySaved).toHaveBeenCalledTimes(1));
    expect(notifySaved).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-1", note: "Dovoláno, pošlu nabídku." })
    );
    // Žádný lokální "success" text v téhle komponentě — potvrzení žije
    // v nadřazeném controlleru (DailyCallsWorkArea), ne tady.
    expect(screen.queryByText("Výsledek uložen")).toBeNull();
  });
});
