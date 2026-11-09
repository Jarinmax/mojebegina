// Jednotný zápis textů v tabulce „Informace o potravině“ (9.–10. 11. 2026).
// Mění se JEN typografie a interpunkce při zobrazení — data v DB (složení,
// čísla, význam) zůstávají beze změny:
//   • větné texty a seznamy (složení, alergeny, skladování, trvanlivost,
//     příprava, výživové údaje souvislým textem) začínají velkým písmenem
//     a končí tečkou,
//   • samostatné hodnoty („3 l“, „700 ml“, „6,3 % obj.“) se nemění,
//   • číslo a jednotka / procento a „E 435“ drží pohromadě nezalomitelnou
//     mezerou (stávající mezery se jen nahradí, žádné se nepřidávají).

const NBSP = " ";

/** Mezery mezi číslem a jednotkou/procentem a v „E 435“ → nezalomitelné. */
export function keepTogether(text: string): string {
  return text
    .replace(/(\d) (%|g|kg|ml|l|kJ|kcal|°C|dnů|dní|měsíců|let)(?=$|[\s,.;:)/–-])/g, `$1${NBSP}$2`)
    .replace(/\bE (\d{3}[a-z]?)\b/g, `E${NBSP}$1`)
    .replace(/(\d) \/ (\d)/g, `$1${NBSP}/ $2`);
}

/** Velké počáteční písmeno a tečka na konci (pokud věta už nekončí . ! ? …). */
export function asSentence(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const capital = t.charAt(0).toLocaleUpperCase("cs") + t.slice(1);
  const ended = /[.!?…]$/.test(capital) ? capital : `${capital}.`;
  return keepTogether(ended);
}
