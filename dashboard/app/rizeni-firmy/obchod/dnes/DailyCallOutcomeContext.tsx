"use client";

import { createContext, useContext } from "react";

// Security Phase 21 (Denní volání 1.1) — sdílený kanál mezi hluboko
// vnořeným CallOutcomeForm (uvnitř serverově vykreslených `children` karty)
// a nadřazeným klientským controllerem DailyCallsWorkArea, který karta
// vlastní nepřežije (pending karta po úspěchu zmizí ze seznamu, co
// controller dostane ze serveru po revalidaci). React Context funguje přes
// tuhle hranici beze zvláštního triku — i "children" vykreslené serverově
// jsou po hydrataci součástí STEJNÉHO klientského stromu, takže
// CallOutcomeForm (list uvnitř children) uvidí Provider, kterého je
// potomkem, bez ohledu na to, kde byl JSX element původně vytvořen.
//
// `registerRef`/`highlightId` řeší zvýraznění a scroll na konkrétní kartu
// (po uložení i po deep-linku `?focus=`) — jeden centrální registr místo
// vlastní ref logiky v každé kartě zvlášť.
export type SavedCallOutcome = {
  itemId: string;
  note: string;
  resultLabel: string;
  nextFollowUpAtLabel: string | null;
};

export type DailyCallOutcomeContextValue = {
  notifySaved: (saved: SavedCallOutcome) => void;
  highlightId: string | null;
  registerRef: (id: string, el: HTMLElement | null) => void;
};

export const DailyCallOutcomeContext = createContext<DailyCallOutcomeContextValue | null>(null);

export function useDailyCallOutcomeContext(): DailyCallOutcomeContextValue | null {
  return useContext(DailyCallOutcomeContext);
}
