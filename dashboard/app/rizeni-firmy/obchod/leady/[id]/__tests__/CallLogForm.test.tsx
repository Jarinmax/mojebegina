// @vitest-environment jsdom
//
// Security Phase 16.5 — regrese na reálně nahlášenou UX past: React po
// úspěšném submitu <form action> vyprázdní neřízené inputy, takže po
// uložení zápisu nebylo z formuláře vidět, že se plán ("Další kontakt",
// "Další krok") skutečně uložil. CallLogForm teď dostává aktuální
// naplánovaný stav z DB (přes props, ne z formuláře) a zobrazuje ho
// nezávisle na tom, co je zrovna v inputech.
//
// "../../actions" je "use server" modul, který přes lib/data/leads.ts
// (server-only, DB klient) není v jsdom testu importovatelný — mockováno,
// testuje se čistě vykreslený DOM, ne skutečné volání akce.
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import CallLogForm from "../CallLogForm";

vi.mock("../../../actions", () => ({
  logCallOutcomeAction: async () => null,
}));

afterEach(() => {
  cleanup();
});

describe("CallLogForm — Security Phase 16.5", () => {
  it("bez naplánovaného stavu (nový lead) se souhrnný blok nezobrazí", () => {
    const { container } = render(<CallLogForm leadId="lead-1" nextFollowUpAt={null} nextStepNote={null} />);
    expect(screen.queryByText(/Další kontakt:/)).toBeNull();
    expect(screen.queryByText(/Další krok:/)).toBeNull();
    // Formulářová pole zůstávají prázdná/neřízená bez ohledu na to.
    const textarea = container.querySelector('textarea[name="note"]') as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("s uloženým nextFollowUpAt i nextStepNote zobrazí oba jako aktuální plán, i když jsou pole formuláře prázdná", () => {
    render(
      <CallLogForm leadId="lead-1" nextFollowUpAt={new Date("2026-09-26T12:00:00.000Z")} nextStepNote="Zavolat a domluvit vzorek" />
    );
    expect(screen.getByText(/Další kontakt:/)).toBeTruthy();
    expect(screen.getByText("26. 9. 2026")).toBeTruthy();
    expect(screen.getByText(/Další krok:/)).toBeTruthy();
    expect(screen.getByText("Zavolat a domluvit vzorek")).toBeTruthy();
  });

  it("jen s nextStepNote (bez data) zobrazí pouze další krok", () => {
    render(<CallLogForm leadId="lead-1" nextFollowUpAt={null} nextStepNote="Poslat vzorek" />);
    expect(screen.queryByText(/Další kontakt:/)).toBeNull();
    expect(screen.getByText(/Další krok:/)).toBeTruthy();
  });

  it("jen s nextFollowUpAt (bez dalšího kroku) zobrazí pouze datum", () => {
    render(<CallLogForm leadId="lead-1" nextFollowUpAt={new Date("2026-01-01T12:00:00.000Z")} nextStepNote={null} />);
    expect(screen.getByText(/Další kontakt:/)).toBeTruthy();
    expect(screen.queryByText(/Další krok:/)).toBeNull();
  });
});

// Jarda – volání a provize, část 1, bod 2 doplňku ("Jednotný zápis výsledku
// hovoru") — CallLogForm teď (přes sdílenou CallOutcomeFields) nabízí
// přesně stejná pole jako CallOutcomeForm (Dnešní volání): výsledek
// hovoru, poznámka, fáze, termín dalšího kontaktu, další krok. Zrcadlí
// CallOutcomeForm.test.tsx 1:1.
describe("CallLogForm — Jarda – volání a provize, část 1 (jednotná pole)", () => {
  it("má pole 'Výsledek hovoru' s placeholderem jako disabled option, ne validní volbu", () => {
    render(<CallLogForm leadId="lead-1" nextFollowUpAt={null} nextStepNote={null} />);
    const select = screen.getByLabelText("Výsledek hovoru") as HTMLSelectElement;
    const placeholder = Array.from(select.options).find((o) => o.value === "");
    expect(placeholder?.disabled).toBe(true);
  });

  it("posun fáze má výchozí volbu 'Fázi neměnit' s prázdnou hodnotou", () => {
    render(<CallLogForm leadId="lead-1" nextFollowUpAt={null} nextStepNote={null} />);
    const select = screen.getByLabelText("Posunout fázi na") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByText("Fázi neměnit")).toBeTruthy();
  });

  it("datum dalšího kontaktu není required, dokud není vybráno 'Zavolat později'", () => {
    render(<CallLogForm leadId="lead-1" nextFollowUpAt={null} nextStepNote={null} />);
    const dateInput = screen.getByLabelText(/^Další kontakt/) as HTMLInputElement;
    expect(dateInput.required).toBe(false);
  });

  it("po výběru výsledku 'Zavolat později' se datum stane required — stejně jako na Dnešním volání", () => {
    render(<CallLogForm leadId="lead-1" nextFollowUpAt={null} nextStepNote={null} />);
    const resultSelect = screen.getByLabelText("Výsledek hovoru") as HTMLSelectElement;
    fireEvent.change(resultSelect, { target: { value: "call_back_later" } });

    const dateInput = screen.getByLabelText(/^Další kontakt/) as HTMLInputElement;
    expect(dateInput.required).toBe(true);
  });

  it("má pole 'Další krok', stejné jméno jako v Dnešním volání", () => {
    render(<CallLogForm leadId="lead-1" nextFollowUpAt={null} nextStepNote={null} />);
    expect(screen.getByLabelText("Další krok")).toBeTruthy();
  });
});
