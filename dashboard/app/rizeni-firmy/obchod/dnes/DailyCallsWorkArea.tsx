"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DoneTodaySection from "./DoneTodaySection";
import { DailyCallOutcomeContext, type SavedCallOutcome } from "./DailyCallOutcomeContext";
import type { DoneTodayItem } from "@/lib/data/dailyCalls";

function focusMatchesDoneToday(focusId: string | null, doneTodayItems: DoneTodayItem[]): boolean {
  return !!focusId && doneTodayItems.some((d) => d.id === focusId);
}

// Security Phase 21 (Denní volání 1.1) — bod 3/7 schváleného zadání.
//
// Pending karta, která se po uložení výsledku stane `done`, zmizí ze
// serverových dat hned po revalidaci — jakýkoli lokální stav UVNITŘ téhle
// karty (nebo uvnitř CallOutcomeFormu v ní) by zmizel s ní. Potvrzení
// proto žije TADY, v nadřazeném klientském controlleru, který se při
// revalidaci NEREMOUNTUJE (stejná instance komponenty, jen nové props ze
// serveru) — jeho `useState` přežije přesně to zmizení karty, které
// potvrzení řeší.
//
// `sections` jsou serverově vykreslené <QueueItemCard> elementy (každý se
// svými `children` — CuratorItemControls/CallOutcomeForm) — tenhle
// komponent je jen ARANŽUJE do sekcí a obaluje Contextem; samotné karty
// (i ty hluboko v `children`) se do něj napojí přes
// useDailyCallOutcomeContext(), bez ohledu na to, že vznikly na serveru.
export type DailyCallsSection = { key: string; header: React.ReactNode; items: React.ReactNode };

export default function DailyCallsWorkArea({
  sections,
  doneTodayItems,
  focusId,
}: {
  sections: DailyCallsSection[];
  doneTodayItems: DoneTodayItem[];
  focusId: string | null;
}) {
  const [confirmation, setConfirmation] = useState<SavedCallOutcome | null>(null);
  const [doneOpen, setDoneOpen] = useState(() => focusMatchesDoneToday(focusId, doneTodayItems));
  const [highlightId, setHighlightId] = useState<string | null>(focusId ?? null);
  const refs = useRef<Map<string, HTMLElement>>(new Map());

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      refs.current.set(id, el);
    } else {
      refs.current.delete(id);
    }
  }, []);

  const notifySaved = useCallback((saved: SavedCallOutcome) => {
    setConfirmation(saved);
    setDoneOpen(true);
    setHighlightId(saved.itemId);
  }, []);

  // Deep-link na dnes vyřízenou položku (`?focus=`) — sekce se musí otevřít
  // SAMA, nestačí, že data obsahují shodu (bod 7). Neplatné/cizí ID na nic
  // z tohoto seznamu nesedí, takže se nic neotevře a nic se nezvýrazní —
  // bezpečné samo o sobě, bez zvláštní kontroly.
  //
  // `doneTodayItems` může dorazit AŽ PO prvním vykreslení (např. jiný
  // pracovník mezitím položku vyřídil ze svého zařízení) — řešeno
  // "upravením stavu při renderu" (React-doporučený vzor, ne efekt): stav
  // se nastaví přímo v těle komponenty, podmíněně na změnu odvozené hodnoty
  // oproti poslední viděné, ne nepodmíněně v useEffect (to by způsobilo
  // zbytečný kaskádový re-render navíc).
  const nowMatches = focusMatchesDoneToday(focusId, doneTodayItems);
  const [prevMatches, setPrevMatches] = useState(nowMatches);
  if (nowMatches !== prevMatches) {
    setPrevMatches(nowMatches);
    if (nowMatches) {
      setDoneOpen(true);
      setHighlightId(focusId);
    }
  }

  useEffect(() => {
    if (!highlightId) {
      return;
    }
    const id = window.setTimeout(() => {
      refs.current.get(highlightId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [highlightId, doneOpen, sections, doneTodayItems]);

  const contextValue = { notifySaved, highlightId, registerRef };

  return (
    <DailyCallOutcomeContext.Provider value={contextValue}>
      <div className="flex flex-col gap-6">
        {confirmation && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-emerald-800">Výsledek uložen</p>
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                className="text-xs text-emerald-700 underline"
              >
                Zavřít
              </button>
            </div>
            <p className="text-sm text-emerald-900 whitespace-pre-wrap">{confirmation.note}</p>
            <p className="text-xs text-emerald-700">
              {confirmation.resultLabel}
              {confirmation.nextFollowUpAtLabel ? ` · Zavolat znovu ${confirmation.nextFollowUpAtLabel}` : ""}
            </p>
          </div>
        )}

        {sections.map((section) => (
          <div key={section.key}>
            {section.header}
            <div className="flex flex-col gap-2">{section.items}</div>
          </div>
        ))}

        <DoneTodaySection items={doneTodayItems} open={doneOpen} onToggle={() => setDoneOpen((v) => !v)} />
      </div>
    </DailyCallOutcomeContext.Provider>
  );
}
