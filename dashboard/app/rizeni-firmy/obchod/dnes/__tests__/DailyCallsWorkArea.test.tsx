// @vitest-environment jsdom
//
// Security Phase 21 (Denní volání 1.1) — regrese na bod 3/7 schváleného
// zadání: potvrzení po uložení musí žít MIMO mizející pending kartu a
// přežít revalidaci (karta zmizí ze sections, položka se objeví v
// doneTodayItems), "Dnes vyřízeno" se musí po uložení i po deep-linku
// samo otevřít a zvýraznit správnou položku, neplatný/cizí deep-link nic
// neprozradí.
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import DailyCallsWorkArea, { type DailyCallsSection } from "../DailyCallsWorkArea";
import { useDailyCallOutcomeContext } from "../DailyCallOutcomeContext";
import type { DoneTodayItem } from "@/lib/data/dailyCalls";

afterEach(() => {
  cleanup();
});

// Simuluje přesně to, co CallOutcomeForm dělá efektem po úspěšném uložení
// (notifySaved přes Context) — bez nutnosti táhnout celý useActionState
// stroj do tohoto testu.
function SaveTrigger({ itemId }: { itemId: string }) {
  const ctx = useDailyCallOutcomeContext();
  return (
    <button
      type="button"
      onClick={() =>
        ctx?.notifySaved({
          itemId,
          note: "Slíbil zavolat zpět příští týden.",
          resultLabel: "Dovoláno – zájem",
          nextFollowUpAtLabel: "8. 10. 2026 v 10:30",
        })
      }
    >
      Uložit (test)
    </button>
  );
}

function doneItem(overrides: Partial<DoneTodayItem> = {}): DoneTodayItem {
  return {
    id: "item-1",
    leadId: "lead-1",
    displayName: "U Kotvy s.r.o.",
    contactPhone: "+420 777 123 456",
    doneAt: new Date("2026-10-07T09:05:00.000Z"),
    result: "reached_interested",
    note: "Slíbil zavolat zpět příští týden.",
    stageFrom: null,
    stageTo: null,
    nextFollowUpAt: new Date("2026-10-08T08:30:00.000Z"),
    activity: [],
    ...overrides,
  };
}

describe("DailyCallsWorkArea — potvrzení přežije zmizení pending karty (Security Phase 21)", () => {
  it("po notifySaved zobrazí banner i poznámku, a po revalidaci (karta zmizí, přijde doneTodayItems) banner zůstane a sekce se otevře", () => {
    const sectionsBefore: DailyCallsSection[] = [
      { key: "today", header: <h2>Dnešní volání (1)</h2>, items: <SaveTrigger key="item-1" itemId="item-1" /> },
    ];

    const { rerender } = render(
      <DailyCallsWorkArea sections={sectionsBefore} doneTodayItems={[]} focusId={null} />
    );

    expect(screen.queryByText("Výsledek uložen")).toBeNull();

    fireEvent.click(screen.getByText("Uložit (test)"));

    expect(screen.getByText("Výsledek uložen")).toBeTruthy();
    expect(screen.getByText("Slíbil zavolat zpět příští týden.")).toBeTruthy();

    // Revalidace: položka zmizela z `sections` (byla pending, teď je done)
    // a objevila se v `doneTodayItems` — STEJNÁ instance komponenty,
    // jen nové props, žádný remount.
    rerender(<DailyCallsWorkArea sections={[]} doneTodayItems={[doneItem()]} focusId={null} />);

    // Potvrzení přežilo zmizení karty — poznámka je teď vidět DVAKRÁT
    // (jednou v banneru, jednou na kartě "Dnes vyřízeno"), ne nulakrát.
    expect(screen.getByText("Výsledek uložen")).toBeTruthy();
    expect(screen.getAllByText("Slíbil zavolat zpět příští týden.")).toHaveLength(2);

    // "Dnes vyřízeno" se automaticky otevřelo a položka je vidět.
    expect(screen.getByText("Dnes vyřízeno (1)")).toBeTruthy();
    expect(screen.getByText("U Kotvy s.r.o.")).toBeTruthy();
  });
});

describe("DailyCallsWorkArea — deep-link na dnes vyřízenou položku (Security Phase 21, bod 7)", () => {
  it("?focus= na položku v doneTodayItems otevře sbalenou sekci bez kliknutí", () => {
    render(<DailyCallsWorkArea sections={[]} doneTodayItems={[doneItem({ id: "item-42" })]} focusId="item-42" />);
    expect(screen.getByText("Dnes vyřízeno (1)")).toBeTruthy();
    expect(screen.getByText("U Kotvy s.r.o.")).toBeTruthy();
  });

  it("neplatný/cizí focusId nic neotevře a nic neprozradí", () => {
    render(
      <DailyCallsWorkArea
        sections={[]}
        doneTodayItems={[doneItem({ id: "item-42" })]}
        focusId="00000000-0000-0000-0000-000000000000"
      />
    );
    // Sekce zůstává sbalená — "Dnes vyřízeno" nadpis je sice vidět
    // (existují položky), ale karta samotná se bez rozbalení nevykreslí.
    expect(screen.getByText("Dnes vyřízeno (1)")).toBeTruthy();
    expect(screen.queryByText("U Kotvy s.r.o.")).toBeNull();
  });
});
