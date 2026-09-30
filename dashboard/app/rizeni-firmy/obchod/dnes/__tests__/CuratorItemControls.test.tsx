// @vitest-environment jsdom
//
// Security Phase 19 — regrese na bug nahlášený z praktického testu:
// kliknutí na "Odebrat" nedávalo žádnou viditelnou odezvu, takže
// zopakované kliknutí odebralo dvě položky místo jedné. Tlačítko se teď
// musí po prvním kliknutí okamžitě deaktivovat, ukázat "Odebírám…" a
// druhý klik (na už deaktivované tlačítko) akci znovu nespustit.
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import CuratorItemControls from "../CuratorItemControls";

const removeMock = vi.fn();
const upMock = vi.fn();
const downMock = vi.fn();

vi.mock("../actions", () => ({
  removeQueueItemAction: (...args: unknown[]) => removeMock(...args),
  moveQueueItemUpAction: (...args: unknown[]) => upMock(...args),
  moveQueueItemDownAction: (...args: unknown[]) => downMock(...args),
}));

afterEach(() => {
  cleanup();
  removeMock.mockReset();
  upMock.mockReset();
  downMock.mockReset();
});

describe("CuratorItemControls — Security Phase 19 (ochrana proti opakovanému odeslání)", () => {
  it("po kliknutí na Odebrat se tlačítko deaktivuje a ukáže 'Odebírám…', druhý klik akci nespustí podruhé", async () => {
    let resolveAction!: (value: null) => void;
    const pendingPromise = new Promise<null>((resolve) => {
      resolveAction = resolve;
    });
    removeMock.mockReturnValue(pendingPromise);

    render(<CuratorItemControls itemId="item-1" isFirst={false} isLast={false} />);

    fireEvent.click(screen.getByText("Odebrat"));

    await waitFor(() => {
      expect(screen.getByText("Odebírám…")).toBeTruthy();
    });
    const pendingButton = screen.getByText("Odebírám…") as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);

    // Druhý klik na deaktivované tlačítko akci nespustí podruhé.
    fireEvent.click(pendingButton);
    expect(removeMock).toHaveBeenCalledTimes(1);

    resolveAction(null);
    await waitFor(() => {
      expect(screen.getByText("Odebrat")).toBeTruthy();
    });
  });

  it("dokud Odebrat probíhá, jsou deaktivovaná i tlačítka Výš/Níž na téže položce", async () => {
    let resolveAction!: (value: null) => void;
    const pendingPromise = new Promise<null>((resolve) => {
      resolveAction = resolve;
    });
    removeMock.mockReturnValue(pendingPromise);

    render(<CuratorItemControls itemId="item-1" isFirst={false} isLast={false} />);
    fireEvent.click(screen.getByText("Odebrat"));

    await waitFor(() => {
      const upButton = screen.getByText("↑ Výš") as HTMLButtonElement;
      expect(upButton.disabled).toBe(true);
    });
    const downButton = screen.getByText("↓ Níž") as HTMLButtonElement;
    expect(downButton.disabled).toBe(true);

    resolveAction(null);
  });

  it("chyba z odebrání se viditelně zobrazí", async () => {
    removeMock.mockResolvedValue({ error: "Položku nelze odebrat (možná už byla vyřízena nebo odebrána)." });

    render(<CuratorItemControls itemId="item-1" isFirst={false} isLast={false} />);
    fireEvent.click(screen.getByText("Odebrat"));

    await waitFor(() => {
      expect(screen.getByText(/nelze odebrat/)).toBeTruthy();
    });
  });
});
