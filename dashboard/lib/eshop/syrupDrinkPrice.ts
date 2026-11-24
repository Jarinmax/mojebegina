// Cena nápoje ze sirupu v úvodu kategorie Sirupy (23. 11. 2026, Lucie/ChatGPT):
// místo závorky „(až 150 nápojů, nápoj už od X Kč)“ dvě věty a modelová cena
// včetně dopravy při 3 × 3 l – ze stejného výpočtu jako tabulka.
import { syrupModelKc } from "./portionPrices";

export function withSyrupDrinkPrice(paragraph: string): string {
  const sentences = `Z jedné třílitrové beginy připravíte až 150 nápojů. Při objednávce 3\u00a0×\u00a03\u00a0l vás jedna sklenice vyjde od ${syrupModelKc()} včetně dopravy.`;
  return paragraph.replace(/\s*\(až 150 nápojů, nápoj[^)]*\)\./, `. ${sentences}`);
}
