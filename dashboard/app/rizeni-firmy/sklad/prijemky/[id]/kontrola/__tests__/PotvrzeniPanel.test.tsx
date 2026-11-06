// @vitest-environment jsdom
//
// Panel potvrzení: překážka tlačítko vždy zablokuje; varování ho odblokují
// až po výslovném odsouhlasení KAŽDÉHO z nich a serveru se pošlou přesně
// odsouhlasené klíče.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ConfirmationChecks } from "@/lib/data/skladConfirmationChecks";
import PotvrzeniPanel from "../PotvrzeniPanel";

const calls = vi.hoisted(() => ({ confirm: [] as Array<{ receiptId: string; keys: string[] }> }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../../../../actions", () => ({
  confirmGoodsReceiptAction: async (receiptId: string, keys: string[]) => {
    calls.confirm.push({ receiptId, keys });
    return { ok: true, movements: 1 };
  },
}));

afterEach(() => {
  cleanup();
  calls.confirm.length = 0;
});

const base: ConfirmationChecks = { status: "draft", lineCount: 1, linesTotalHal: 9000, documentTotalHal: 10000, blockers: [], warnings: [] };
const button = () => screen.getByRole("button", { name: "Potvrdit příjemku a naskladnit" }) as HTMLButtonElement;

describe("PotvrzeniPanel", () => {
  it("překážka: tlačítko je zablokované a hláška je vidět", () => {
    render(<PotvrzeniPanel receiptId="r-1" checks={{ ...base, blockers: [{ code: "unmapped", message: "Chybí skladová karta u: „Cukr“." }] }} canConfirm />);
    expect(screen.getByText("Chybí skladová karta u: „Cukr“.")).toBeTruthy();
    expect(button().disabled).toBe(true);
  });

  it("varování: tlačítko se odblokuje až po zaškrtnutí všech; server dostane přesně odsouhlasené klíče", async () => {
    const warnings = [
      { key: "totals_mismatch:10000:9000", code: "totals_mismatch", message: "Součet řádků nesouhlasí." },
      { key: "document_number_missing", code: "document_number_missing", message: "Doklad nemá číslo." },
    ];
    render(<PotvrzeniPanel receiptId="r-1" checks={{ ...base, warnings }} canConfirm />);
    const boxes = screen.getAllByRole("checkbox");
    expect(button().disabled).toBe(true);
    fireEvent.click(boxes[0]);
    expect(button().disabled).toBe(true);
    fireEvent.click(boxes[1]);
    expect(button().disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button());
    });
    expect(calls.confirm).toEqual([{ receiptId: "r-1", keys: ["totals_mismatch:10000:9000", "document_number_missing"] }]);
  });

  it("bez oprávnění potvrdit se tlačítko vůbec nezobrazí", () => {
    render(<PotvrzeniPanel receiptId="r-1" checks={base} canConfirm={false} />);
    expect(screen.queryByRole("button", { name: "Potvrdit příjemku a naskladnit" })).toBeNull();
  });
});
