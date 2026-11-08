// Oslovení zákazníka v e-mailech (majitel, 8. 11. 2026): ne „Dobrý den,
// Jiří Průcha,“, ale „Dobrý den, pane Průcho,“ / „Dobrý den, paní
// Průchová,“ — příjmení v 5. pádě, bez křestního jména.
//
// Vždy „pane …“ nebo „paní …“ (pravidlo Beginy). Neutrální „Dobrý den,“
// jen když jméno není jméno osoby (název firmy, jedno slovo). Pohlaví:
// příjmení na -ová/-á nebo ženské křestní jméno → paní (příjmení se
// neskloňuje), jinak pan + 5. pád příjmení. Čisté funkce bez I/O.

export const NEUTRAL_GREETING = "Dobrý den,";

const BUSINESS_WORDS = /^(bistro|kavárna|kavarna|cukrárna|cukrarna|restaurace|restaurant|hotel|café|cafe|pivnice|hospoda|jídelna|škola|školka|s\.?r\.?o\.?|a\.?s\.?|spol\.?|firma|obchod|pekárna|penzion|bar|catering|klub|kancelář)$/i;

const cap = (s: string) => s.charAt(0).toLocaleUpperCase("cs") + s.slice(1);

/** Mužská křestní jména končící na -a/-e (jinak -a/-e = spíš žena). */
const MALE_NAMES_ENDING_A_E = new Set(["jirka", "honza", "míla", "nikola", "saša", "jožka", "kuba", "luka", "ilja", "rene", "uwe", "mike", "dave", "steve", "joe", "jose"]);

/** 5. pád mužského příjmení; null = nejde o příjmení (neobvyklé znaky). */
export function maleSurnameVocative(surname: string): string | null {
  const s = surname.trim();
  const lower = s.toLocaleLowerCase("cs");
  if (!/^\p{L}[\p{L}'-]*$/u.test(s) || s.length < 2) return null;
  // přídavná jména (Novotný, Krejčí) — beze změny
  if (/[ýí]$/.test(lower)) return s;
  // Průcha → Průcho, Svoboda → Svobodo
  if (/a$/.test(lower)) return s.slice(0, -1) + "o";
  // Hájek → Hájku, Vacek → Vacku (pohyblivé -e-)
  if (/[^aeiouyáéíóúůý]ek$/.test(lower)) return s.slice(0, -2) + "ku";
  // Novák → Nováku, Vlach → Vlachu, Kroh → Krohu
  if (/(k|h|g|ch)$/.test(lower)) return s + "u";
  // Bartoš → Bartoši, Kříž → Kříži, Kovář → Kováři, Beneš → Beneši
  if (/[šžčřcjťďň]$/.test(lower) && !/ec$/.test(lower)) return s + "i";
  // Petr → Petře (souhláska + r)
  if (/[^aeiouyáéíóúůý]r$/.test(lower)) return s.slice(0, -1) + "ře";
  // Němec → Němče, Moravec → Moravče, Kadlec → Kadleče (pohyblivé -e-)
  if (/[^aeiouyáéíóúůý]ec$/.test(lower)) return s.slice(0, -2) + "če";
  if (/ec$/.test(lower)) return s.slice(0, -1) + "če";
  // Havel → Havle, Pavel → Pavle (souhláska + el)
  if (/[^aeiouyáéíóúůý]el$/.test(lower)) return s.slice(0, -2) + "le";
  // Viner → Vinere, Pospíšil → Pospíšile, Zeman → Zemane, Holub → Holube
  if (/[bdfmnprstvlzwx]$/.test(lower)) return s + "e";
  // jiné zakončení (-o, -e, -u, -i…, cizí jména) — beze změny
  return s;
}

/**
 * „Dobrý den, pane Průcho,“ / „Dobrý den, paní Průchová,“ / „Dobrý den,“.
 * Jméno se bere tak, jak ho zákazník napsal v pokladně („Jiří Průcha“).
 */
export function customerGreeting(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return NEUTRAL_GREETING;
  // tituly (Ing., Mgr., Ph.D.) a čárky pryč
  const words = parts.map((p) => p.replace(/,$/, "")).filter((p) => !/\.$/.test(p) && !/^(ph\.?d|csc|mba|dis)$/i.test(p));
  if (words.length < 2) return NEUTRAL_GREETING;
  const first = words[0];
  const surname = words[words.length - 1];
  const surnameLower = surname.toLocaleLowerCase("cs");
  const firstLower = first.toLocaleLowerCase("cs");
  if (!/^\p{L}/u.test(surname) || surname.length < 2) return NEUTRAL_GREETING;
  // název provozovny / firmy místo jména osoby
  if (words.some((w) => BUSINESS_WORDS.test(w))) return NEUTRAL_GREETING;

  // žena: příjmení na -ová / -á (Průchová, Malá) — příjmení se neskloňuje
  if (/(ová|á)$/.test(surnameLower)) return `Dobrý den, paní ${cap(surname)},`;
  // ženské křestní jméno (Jana Novák, Marie Bartoš) → paní, příjmení beze změny
  const femaleFirst = /[ae]$/.test(firstLower) && !MALE_NAMES_ENDING_A_E.has(firstLower);
  if (femaleFirst) return `Dobrý den, paní ${cap(surname)},`;
  const vocative = maleSurnameVocative(cap(surname));
  return vocative ? `Dobrý den, pane ${vocative},` : NEUTRAL_GREETING;
}
