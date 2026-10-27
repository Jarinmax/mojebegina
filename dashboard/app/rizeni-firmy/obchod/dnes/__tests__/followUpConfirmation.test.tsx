// @vitest-environment jsdom
//
// Etapa 0, krok B — potvrzení a karta „Dnes vyřízeno“ odpovídají tomu, co
// se s termínem v zápisu SKUTEČNĚ stalo (nový / zachovaný / výslovně
// smazaný), ne jen tomu, co bylo vyplněno ve formuláři.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { followUpConfirmationText } from "../dailyCallLabels";
import DoneTodayCard from "../DoneTodayCard";
import type { DoneTodayItem } from "@/lib/data/dailyCalls";

afterEach(() => cleanup());

const AT = new Date("2026-11-02T08:00:00.000Z"); // 2. 11. 2026 9:00 Praha

describe("followUpConfirmationText", () => {
  it("nový termín", () => {
    expect(followUpConfirmationText("set", AT)).toMatch(/^Zavolat znovu 2\. 11\. 2026 .*9:00/);
  });
  it("zachovaný termín se ukáže jako „beze změny“, ne jako by žádný nebyl", () => {
    expect(followUpConfirmationText("kept", AT)).toMatch(/^Další kontakt beze změny: 2\. 11\. 2026/);
    expect(followUpConfirmationText("kept", null)).toBeNull();
  });
  it("výslovné smazání", () => {
    expect(followUpConfirmationText("cleared", null)).toBe("Naplánovaný kontakt smazán");
  });
});

function item(overrides: Partial<DoneTodayItem> = {}): DoneTodayItem {
  return {
    id: "item-1",
    leadId: "lead-1",
    displayName: "U Kotvy s.r.o.",
    contactPhone: null,
    doneAt: new Date("2026-10-27T09:05:00.000Z"),
    result: "no_answer",
    note: "Nebral to.",
    stageFrom: null,
    stageTo: null,
    nextFollowUpAt: null,
    followUpCleared: false,
    activity: [],
    ...overrides,
  };
}

describe("DoneTodayCard — termín", () => {
  it("výslovně smazaný termín je na kartě vidět", () => {
    render(<DoneTodayCard item={item({ followUpCleared: true })} />);
    expect(screen.getByText("Naplánovaný kontakt smazán")).toBeTruthy();
  });
  it("bez změny termínu karta o termínu nic netvrdí", () => {
    render(<DoneTodayCard item={item()} />);
    expect(screen.queryByText("Naplánovaný kontakt smazán")).toBeNull();
    expect(screen.queryByText(/Zavolat znovu/)).toBeNull();
  });
});
