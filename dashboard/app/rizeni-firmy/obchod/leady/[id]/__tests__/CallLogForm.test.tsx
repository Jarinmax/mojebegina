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
import { cleanup, render, screen } from "@testing-library/react";
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
