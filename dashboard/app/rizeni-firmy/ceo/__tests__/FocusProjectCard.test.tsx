// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FocusProjectCard from "../FocusProjectCard";
import type { FocusProjectCardData } from "@/lib/data/ceoFocus";

afterEach(() => {
  cleanup();
});

function baseProject(overrides: Partial<FocusProjectCardData> = {}): FocusProjectCardData {
  return {
    id: "proj-1",
    title: "Begina.cz – nový web",
    priority: "medium",
    status: "green",
    statusReason: null,
    description: null,
    nextStep: null,
    ownerUserId: null,
    ownerName: null,
    isActiveNow: false,
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

// Security Phase 17 — UX princip ze zadání: priorita, na čem se pracuje,
// kdo je na tahu, další krok a blocker musí být vidět v kartě samotné.
describe("FocusProjectCard — Security Phase 17", () => {
  it("odkazuje na detail projektu", () => {
    const { container } = render(<FocusProjectCard project={baseProject()} />);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/rizeni-firmy/ceo/proj-1");
  });

  it("aktivní projekt zobrazí odznak TEĎ", () => {
    render(<FocusProjectCard project={baseProject({ isActiveNow: true })} />);
    expect(screen.getByText("TEĎ")).toBeTruthy();
  });

  it("neaktivní projekt odznak TEĎ nezobrazí", () => {
    render(<FocusProjectCard project={baseProject({ isActiveNow: false })} />);
    expect(screen.queryByText("TEĎ")).toBeNull();
  });

  it("zobrazí blocker jen když je stav červený", () => {
    render(<FocusProjectCard project={baseProject({ status: "red", statusReason: "Čekáme na dodavatele" })} />);
    expect(screen.getByText(/Čekáme na dodavatele/)).toBeTruthy();
  });

  it("nezobrazí blocker text, když je stav zelený, i kdyby statusReason nebyl prázdný", () => {
    render(<FocusProjectCard project={baseProject({ status: "green", statusReason: "Starý důvod" })} />);
    expect(screen.queryByText(/Starý důvod/)).toBeNull();
  });

  it("zobrazí další krok a jméno vlastníka", () => {
    render(
      <FocusProjectCard
        project={baseProject({ nextStep: "Schválit design", ownerName: "Jaroslav Viner" })}
      />
    );
    expect(screen.getByText(/Schválit design/)).toBeTruthy();
    expect(screen.getByText("Jaroslav Viner")).toBeTruthy();
  });

  it("bez vlastníka zobrazí jasný fallback", () => {
    render(<FocusProjectCard project={baseProject({ ownerName: null })} />);
    expect(screen.getByText("Nikdo na tahu")).toBeTruthy();
  });
});
