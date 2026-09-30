// @vitest-environment jsdom
//
// Security Phase 19.1 — "Zahodit celý návrh" musí před provedením
// vyžádat potvrzení (stejný vzor jako ArchiveButton), po kliknutí se
// okamžitě deaktivovat a ukázat "Zahazuji návrh…", a chybu (pokud
// nastane) viditelně zobrazit.
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import DiscardDraftButton from "../DiscardDraftButton";

const discardMock = vi.fn();

vi.mock("../actions", () => ({
  discardDraftAction: (...args: unknown[]) => discardMock(...args),
}));

afterEach(() => {
  cleanup();
  discardMock.mockReset();
  vi.restoreAllMocks();
});

describe("DiscardDraftButton — Security Phase 19.1", () => {
  it("bez potvrzení (window.confirm vrátí false) se akce vůbec nespustí", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<DiscardDraftButton draftCount={10} />);
    fireEvent.click(screen.getByText("Zahodit celý návrh"));

    expect(discardMock).not.toHaveBeenCalled();
  });

  it("po potvrzení se tlačítko deaktivuje a ukáže 'Zahazuji návrh…', druhý klik akci nespustí podruhé", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let resolveAction!: (value: { success: string }) => void;
    const pendingPromise = new Promise<{ success: string }>((resolve) => {
      resolveAction = resolve;
    });
    discardMock.mockReturnValue(pendingPromise);

    render(<DiscardDraftButton draftCount={10} />);
    fireEvent.click(screen.getByText("Zahodit celý návrh"));

    await waitFor(() => {
      expect(screen.getByText("Zahazuji návrh…")).toBeTruthy();
    });
    const pendingButton = screen.getByText("Zahazuji návrh…") as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);

    fireEvent.click(pendingButton);
    expect(discardMock).toHaveBeenCalledTimes(1);

    resolveAction({ success: "Zahozeno 10 položek návrhu." });
    await waitFor(() => {
      expect(screen.getByText("Zahodit celý návrh")).toBeTruthy();
    });
  });

  it("chyba z akce se viditelně zobrazí", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    discardMock.mockResolvedValue({ error: "Zahození se nepodařilo." });

    render(<DiscardDraftButton draftCount={3} />);
    fireEvent.click(screen.getByText("Zahodit celý návrh"));

    await waitFor(() => {
      expect(screen.getByText("Zahození se nepodařilo.")).toBeTruthy();
    });
  });
});
