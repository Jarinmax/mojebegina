// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import QueueItemCard from "../QueueItemCard";
import { DailyCallOutcomeContext } from "../DailyCallOutcomeContext";
import type { ActivityPreviewEntry, QueueItemCardData } from "@/lib/data/dailyCalls";

afterEach(() => {
  cleanup();
});

function activityEntry(overrides: Partial<ActivityPreviewEntry> = {}): ActivityPreviewEntry {
  return {
    id: "activity-1",
    kind: "call_logged",
    authorName: "Jaroslav Blahout",
    body: "Slíbil zavolat zpět.",
    metadata: { callResult: "reached_interested" },
    createdAt: new Date("2026-06-01T09:00:00.000Z"),
    ...overrides,
  };
}

function baseItem(overrides: Partial<QueueItemCardData> = {}): QueueItemCardData {
  return {
    id: "item-1",
    position: 0,
    source: "auto",
    isDraft: false,
    addedForDate: "2026-06-01",
    leadId: "lead-1",
    displayName: "U Kotvy s.r.o.",
    contactPhone: "+420 777 123 456",
    stage: "new",
    nextFollowUpAt: null,
    activity: [],
    ...overrides,
  };
}

// Security Phase 19/21 — jméno, klikací telefon, stav, pořadí, poslední
// relevantní hovory (bod 1 schváleného zadání: vždy vidět, bez kliknutí).
describe("QueueItemCard — Security Phase 19/21", () => {
  it("zobrazí jméno a pořadí", () => {
    render(<QueueItemCard item={baseItem()} orderNumber={3} />);
    expect(screen.getByText("U Kotvy s.r.o.")).toBeTruthy();
    expect(screen.getByText("#3")).toBeTruthy();
  });

  it("telefon je klikací tel: odkaz bez mezer", () => {
    const { container } = render(<QueueItemCard item={baseItem()} orderNumber={1} />);
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("tel:+420777123456");
  });

  it("bez telefonu se odkaz nezobrazí", () => {
    const { container } = render(<QueueItemCard item={baseItem({ contactPhone: null })} orderNumber={1} />);
    expect(container.querySelector("a")).toBeNull();
  });

  it("další kontakt se zobrazí, pokud je naplánovaný", () => {
    render(<QueueItemCard item={baseItem({ nextFollowUpAt: new Date("2026-10-08T08:30:00.000Z") })} orderNumber={1} />);
    expect(screen.getByText(/Další kontakt:/)).toBeTruthy();
  });

  it("bez historie zobrazí placeholder, ne prázdný blok", () => {
    render(<QueueItemCard item={baseItem({ activity: [] })} orderNumber={1} />);
    expect(screen.getByText("Zatím žádná historie hovorů.")).toBeTruthy();
  });

  it("poslední 3 relevantní záznamy jsou vidět VŽDY, bez jakéhokoli kliknutí", () => {
    const activity = [
      activityEntry({ id: "a1", body: "První poznámka (nejnovější)." }),
      activityEntry({ id: "a2", body: "Druhá poznámka." }),
      activityEntry({ id: "a3", body: "Třetí poznámka." }),
    ];
    render(<QueueItemCard item={baseItem({ activity })} orderNumber={1} />);
    expect(screen.getByText("První poznámka (nejnovější).")).toBeTruthy();
    expect(screen.getByText("Druhá poznámka.")).toBeTruthy();
    expect(screen.getByText("Třetí poznámka.")).toBeTruthy();
  });

  it("má-li lead méně než 3 záznamy, zobrazí jen existující (žádný placeholder navíc)", () => {
    const activity = [activityEntry({ id: "a1", body: "Jediná poznámka." })];
    render(<QueueItemCard item={baseItem({ activity })} orderNumber={1} />);
    expect(screen.getByText("Jediná poznámka.")).toBeTruthy();
    expect(screen.queryByText("Zatím žádná historie hovorů.")).toBeNull();
  });

  it("4. a další záznam je skrytý, dokud se historie nerozbalí", () => {
    const activity = [
      activityEntry({ id: "a1", body: "Poznámka 1." }),
      activityEntry({ id: "a2", body: "Poznámka 2." }),
      activityEntry({ id: "a3", body: "Poznámka 3." }),
      activityEntry({ id: "a4", body: "Poznámka 4 (starší)." }),
    ];
    render(<QueueItemCard item={baseItem({ activity })} orderNumber={1} />);
    expect(screen.queryByText("Poznámka 4 (starší).")).toBeNull();

    fireEvent.click(screen.getByText("Zobrazit celou historii (4)"));
    expect(screen.getByText("Poznámka 4 (starší).")).toBeTruthy();
  });

  it("nemá-li karta víc než 3 záznamy, tlačítko rozbalení se nezobrazí", () => {
    const activity = [activityEntry({ id: "a1" }), activityEntry({ id: "a2" })];
    render(<QueueItemCard item={baseItem({ activity })} orderNumber={1} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("QueueItemCard — přístupnost a klikací plocha (Security Phase 21, bod 2)", () => {
  it("kořen karty je neinteraktivní <article>, ne <div role=\"button\">", () => {
    const { container } = render(<QueueItemCard item={baseItem()} orderNumber={1} />);
    expect(container.querySelector("article")).not.toBeNull();
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it("tlačítko rozbalení má aria-expanded a aria-controls", () => {
    const activity = [
      activityEntry({ id: "a1" }),
      activityEntry({ id: "a2" }),
      activityEntry({ id: "a3" }),
      activityEntry({ id: "a4", body: "Starší." }),
    ];
    render(<QueueItemCard item={baseItem({ activity })} orderNumber={1} />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const controlsId = button.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(controlsId!)).not.toBeNull();
  });

  it("klik na telefon nerozbaluje kartu (zbytek historie zůstane skrytý)", () => {
    const activity = [
      activityEntry({ id: "a1" }),
      activityEntry({ id: "a2" }),
      activityEntry({ id: "a3" }),
      activityEntry({ id: "a4", body: "Starší záznam." }),
    ];
    const { container } = render(<QueueItemCard item={baseItem({ activity })} orderNumber={1} />);
    fireEvent.click(container.querySelector("a")!);
    expect(screen.queryByText("Starší záznam.")).toBeNull();
  });

  it("klik na formulářová tlačítka v children nerozbaluje kartu", () => {
    const activity = [
      activityEntry({ id: "a1" }),
      activityEntry({ id: "a2" }),
      activityEntry({ id: "a3" }),
      activityEntry({ id: "a4", body: "Starší záznam." }),
    ];
    const onChildClick = vi.fn();
    render(
      <QueueItemCard item={baseItem({ activity })} orderNumber={1}>
        <button type="button" onClick={onChildClick}>
          Zapsat výsledek
        </button>
      </QueueItemCard>
    );
    fireEvent.click(screen.getByText("Zapsat výsledek"));
    expect(onChildClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Starší záznam.")).toBeNull();
  });

  it("klik na neinteraktivní plochu karty (jméno) rozbalení VYVOLÁ", () => {
    const activity = [
      activityEntry({ id: "a1" }),
      activityEntry({ id: "a2" }),
      activityEntry({ id: "a3" }),
      activityEntry({ id: "a4", body: "Starší záznam." }),
    ];
    render(<QueueItemCard item={baseItem({ activity })} orderNumber={1} />);
    fireEvent.click(screen.getByText("U Kotvy s.r.o."));
    expect(screen.getByText("Starší záznam.")).toBeTruthy();
  });

  it("DOM neobsahuje vnořené interaktivní prvky (<a>/<button> v <a>/<button>)", () => {
    const activity = [activityEntry({ id: "a1" }), activityEntry({ id: "a2" }), activityEntry({ id: "a3" }), activityEntry({ id: "a4" })];
    const { container } = render(
      <QueueItemCard item={baseItem({ activity })} orderNumber={1}>
        <button type="button">Zapsat výsledek</button>
      </QueueItemCard>
    );
    const interactive = container.querySelectorAll("a, button");
    interactive.forEach((el) => {
      const ancestorInteractive = el.parentElement?.closest("a, button");
      expect(ancestorInteractive).toBeNull();
    });
  });
});

describe("QueueItemCard — zvýraznění přes DailyCallOutcomeContext (Security Phase 21, bod 7)", () => {
  it("zvýrazní kartu, jejíž id odpovídá highlightId z kontextu", () => {
    const { container } = render(
      <DailyCallOutcomeContext.Provider value={{ notifySaved: () => {}, highlightId: "item-1", registerRef: () => {} }}>
        <QueueItemCard item={baseItem({ id: "item-1" })} orderNumber={1} />
      </DailyCallOutcomeContext.Provider>
    );
    expect(container.querySelector("article")?.className).toMatch(/ring-2/);
  });

  it("nezvýrazní kartu, jejíž id neodpovídá highlightId (cizí/neplatné ID nic neprozradí)", () => {
    const { container } = render(
      <DailyCallOutcomeContext.Provider
        value={{ notifySaved: () => {}, highlightId: "00000000-0000-0000-0000-000000000000", registerRef: () => {} }}
      >
        <QueueItemCard item={baseItem({ id: "item-1" })} orderNumber={1} />
      </DailyCallOutcomeContext.Provider>
    );
    expect(container.querySelector("article")?.className).not.toMatch(/ring-2/);
  });
});
