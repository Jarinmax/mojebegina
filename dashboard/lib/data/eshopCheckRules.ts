// Registr „Kontrola e-shopu – Lucie“ — čistá pravidla bez I/O (sdílí server
// i karta úkolu). Datová vrstva je v eshopCheck.ts.

export const ESHOP_CHECK_TITLE = /^BEG-(\d{2})\b/;
export const ESHOP_CHECK_REGISTER_NAME = "Kontrola e-shopu – Lucie";
export const ESHOP_CHECK_PATH = "/prace/kontrola-eshopu";

export function isEshopCheckTask(title: string): boolean {
  return ESHOP_CHECK_TITLE.test(title);
}

export const ESHOP_CHECK_STATUS_LABEL: Record<string, string> = {
  open: "Čeká na kontrolu Lucie",
  returned: "Vráceno k opravě",
  done: "Schváleno Lucií",
  submitted: "Čeká na kontrolu Lucie",
  cancelled: "Zrušeno",
};

export type EshopCheckHeader = { priority: string | null; technical: string | null; responsible: string | null };

/** Řádky „Priorita: P0“, „Technický stav: …“, „Odpovědný: …“ z popisu. */
export function parseEshopCheckHeader(description: string | null): EshopCheckHeader {
  const line = (label: string) => {
    const m = new RegExp(`^${label}:\\s*(.+)$`, "mi").exec(description ?? "");
    return m ? m[1].trim() : null;
  };
  return { priority: line("Priorita"), technical: line("Technický stav"), responsible: line("Odpovědný") };
}

