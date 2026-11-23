// Sloučení výsledků rozpoznávání řeči do jednoho textu (23. 11. 2026).
// Chrome na Androidu v režimu „continuous“ posílá výsledky kumulativně:
// každý další obsahuje znovu celý dosavadní text („…příští týdenTak dneska
// jsem mluvil…“ se opakovalo). Safari a Chrome na počítači posílají
// navazující kousky. Tahle funkce zvládne obojí: kousek, který začíná tím,
// co už máme, text nahradí; kousek, který už v textu je, přeskočí; jinak
// ho připojí s mezerou.
const norm = (s: string) => s.toLocaleLowerCase("cs").replace(/\s+/g, " ").trim();

export function mergeTranscripts(parts: readonly string[]): string {
  let acc = "";
  for (const raw of parts) {
    const part = raw.replace(/\s+/g, " ").trim();
    if (!part) continue;
    if (!acc) {
      acc = part;
      continue;
    }
    const a = norm(acc);
    const p = norm(part);
    if (p.startsWith(a)) acc = part;
    else if (a.endsWith(p) || a.includes(p)) continue;
    else acc = `${acc} ${part}`;
  }
  return acc;
}

/** Android Chrome má continuous režim rozbitý — tam bereme po jedné větě a obnovujeme. */
export function continuousModeFor(userAgent: string): boolean {
  return !/Android/i.test(userAgent);
}
