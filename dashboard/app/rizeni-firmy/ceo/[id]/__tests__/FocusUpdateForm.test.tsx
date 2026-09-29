// @vitest-environment jsdom
//
// Security Phase 17 — regrese na stejnou UX past jako CallLogForm
// (Security Phase 16.5): po úspěšném submitu React vyprázdní formulář,
// takže aktuální popis/další krok/blocker se musí zobrazovat nezávisle na
// obsahu polí.
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FocusUpdateForm from "../FocusUpdateForm";

vi.mock("../../actions", () => ({
  updateFocusProjectAction: async () => null,
}));

afterEach(() => {
  cleanup();
});

describe("FocusUpdateForm — Security Phase 17", () => {
  it("bez uloženého stavu se souhrnný blok nezobrazí", () => {
    render(<FocusUpdateForm projectId="proj-1" description={null} nextStep={null} statusReason={null} />);
    expect(screen.queryByText(/Aktuálně řešíme:/)).toBeNull();
    expect(screen.queryByText(/Další krok:/)).toBeNull();
  });

  it("zobrazí uložený popis, další krok i blocker zároveň", () => {
    render(
      <FocusUpdateForm
        projectId="proj-1"
        description="Návrh homepage"
        nextStep="Schválit s klientem"
        statusReason="Čekáme na grafika"
      />
    );
    expect(screen.getByText("Návrh homepage")).toBeTruthy();
    expect(screen.getByText("Schválit s klientem")).toBeTruthy();
    expect(screen.getByText("Čekáme na grafika")).toBeTruthy();
  });

  it("bez blockeru (zelený stav) se blocker řádek nezobrazí, i když popis/další krok ano", () => {
    render(
      <FocusUpdateForm
        projectId="proj-1"
        description="Návrh homepage"
        nextStep="Schválit s klientem"
        statusReason={null}
      />
    );
    expect(screen.queryByText(/⚠/)).toBeNull();
  });
});
