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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CallLogForm from "../CallLogForm";

vi.mock("../../../actions", () => ({
  logCallOutcomeAction: async () => null,
  removeLeadFollowUpAction: async () => null,
  retryLeadCalendarSyncAction: async () => null,
  logNoAnswerAction: async () => null,
}));

afterEach(() => {
  cleanup();
});

describe("CallLogForm — Security Phase 16.5", () => {
  it("bez naplánovaného stavu (nový lead) se souhrnný blok nezobrazí", () => {
    const { container } = render(
      <CallLogForm leadId="lead-1" nextFollowUpAt={null} nextStepNote={null} calendarSync={null} />
    );
    expect(screen.queryByText(/Další kontakt:/)).toBeNull();
    expect(screen.queryByText(/Další krok:/)).toBeNull();
    // Formulářová pole zůstávají prázdná/neřízená bez ohledu na to.
    fireEvent.click(screen.getByText("✅ Dovolal/a jsem se"));
    const textarea = container.querySelector('textarea[name="note"]') as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("s uloženým nextFollowUpAt i nextStepNote zobrazí oba jako aktuální plán, i když jsou pole formuláře prázdná", () => {
    render(
      <CallLogForm
        leadId="lead-1"
        nextFollowUpAt={new Date("2026-09-26T12:00:00.000Z")}
        nextStepNote="Zavolat a domluvit vzorek"
        calendarSync={null}
      />
    );
    expect(screen.getByText(/Další kontakt:/)).toBeTruthy();
    // 2026-09-26T12:00:00.000Z je v září letní čas (CEST, UTC+2) → 14:00.
    expect(screen.getByText("26. 9. 2026 14:00")).toBeTruthy();
    expect(screen.getByText(/Další krok:/)).toBeTruthy();
    expect(screen.getByText("Zavolat a domluvit vzorek")).toBeTruthy();
  });

  it("jen s nextStepNote (bez data) zobrazí pouze další krok", () => {
    render(<CallLogForm leadId="lead-1" nextFollowUpAt={null} nextStepNote="Poslat vzorek" calendarSync={null} />);
    expect(screen.queryByText(/Další kontakt:/)).toBeNull();
    expect(screen.getByText(/Další krok:/)).toBeTruthy();
  });

  it("jen s nextFollowUpAt (bez dalšího kroku) zobrazí pouze datum", () => {
    render(
      <CallLogForm leadId="lead-1" nextFollowUpAt={new Date("2026-01-01T12:00:00.000Z")} nextStepNote={null} calendarSync={null} />
    );
    expect(screen.getByText(/Další kontakt:/)).toBeTruthy();
    expect(screen.queryByText(/Další krok:/)).toBeNull();
  });

  it("bez chyby synchronizace (status synced/pending/null) se varování a tlačítko 'Zkusit znovu' nezobrazí", () => {
    render(
      <CallLogForm
        leadId="lead-1"
        nextFollowUpAt={null}
        nextStepNote={null}
        calendarSync={{ status: "synced", lastError: null }}
      />
    );
    expect(screen.queryByText("Zkusit znovu")).toBeNull();
  });

  it("se status 'failed' zobrazí srozumitelnou chybu i tlačítko 'Zkusit znovu'", () => {
    render(
      <CallLogForm
        leadId="lead-1"
        nextFollowUpAt={null}
        nextStepNote={null}
        calendarSync={{ status: "failed", lastError: "Google Kalendář není propojen." }}
      />
    );
    expect(screen.getByText(/Synchronizace s Google kalendářem se nezdařila: Google Kalendář není propojen\./)).toBeTruthy();
    expect(screen.getByText("Zkusit znovu")).toBeTruthy();
  });
});

// 22. 11. 2026 — chyba u LumoKids: zápis se ztratil. Nic napsaného se nesmí ztratit.
describe("CallLogForm — nic se neztratí (22. 11. 2026)", () => {
  afterEach(() => window.localStorage.clear());

  it("čas je předvyplněný 9:00", () => {
    const { container } = render(<CallLogForm leadId="lead-a" nextFollowUpAt={null} nextStepNote={null} calendarSync={null} />);
    fireEvent.click(screen.getByText("✅ Dovolal/a jsem se"));
    expect((container.querySelector('input[name="nextFollowUpAtTime"]') as HTMLInputElement).value).toBe("09:00");
  });

  it("datum bez času: neodešle se, pole zůstanou vyplněná a u Času svítí „Doplňte čas“", () => {
    const { container } = render(<CallLogForm leadId="lead-b" nextFollowUpAt={null} nextStepNote={null} calendarSync={null} />);
    fireEvent.click(screen.getByText("Jen zapsat poznámku (bez hovoru)"));
    const note = container.querySelector('textarea[name="note"]') as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Domluveno, zavolat 30. 11." } });
    fireEvent.change(container.querySelector('input[name="nextFollowUpAtDate"]')!, { target: { value: "2026-11-30" } });
    fireEvent.change(container.querySelector('input[name="nextFollowUpAtTime"]')!, { target: { value: "" } });
    fireEvent.click(screen.getByText("Uložit zápis"));
    expect(screen.getByText("Doplňte čas")).toBeTruthy();
    expect(note.value).toBe("Domluveno, zavolat 30. 11.");
  });

  it("rozepsaný zápis přežije nové vykreslení stránky", () => {
    const first = render(<CallLogForm leadId="lead-c" nextFollowUpAt={null} nextStepNote={null} calendarSync={null} />);
    fireEvent.click(screen.getByText("Jen zapsat poznámku (bez hovoru)"));
    fireEvent.change(first.container.querySelector('textarea[name="note"]')!, { target: { value: "Rozepsané" } });
    first.unmount();
    const { container } = render(<CallLogForm leadId="lead-c" nextFollowUpAt={null} nextStepNote={null} calendarSync={null} />);
    expect((container.querySelector('textarea[name="note"]') as HTMLTextAreaElement).value).toBe("Rozepsané");
    expect(screen.getByText(/Obnovený rozepsaný zápis/)).toBeTruthy();
  });

  it("na začátku jsou jen dvě tlačítka Nezvedá / Dovolal a bez Uložit zápis", () => {
    const { container } = render(<CallLogForm leadId="lead-d" nextFollowUpAt={null} nextStepNote={null} calendarSync={null} />);
    expect(screen.getByText("📵 Nezvedá")).toBeTruthy();
    expect(screen.getByText("✅ Dovolal/a jsem se")).toBeTruthy();
    expect(screen.queryByText("Uložit zápis")).toBeNull();
    expect(container.querySelector('textarea[name="note"]')).toBeNull();
  });
});
