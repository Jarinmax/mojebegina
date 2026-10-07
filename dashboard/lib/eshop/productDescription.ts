// ESHOP 1.0 — popis produktu (products.description, pole odstavců) s
// jednoduchým formátováním, aby šly převzít celé texty z begina.cz:
//   "## Nadpis"          → samostatná sekce (zobrazí se pod chutí produktu)
//   "- text"             → odrážka (po sobě jdoucí odrážky = jeden seznam)
//   "**tučně:** text"    → tučná část uvnitř odstavce i odrážky
// Odstavce před prvním nadpisem tvoří úvodní „Popis“. Bez změny schématu.

export type DescriptionBlock = { type: "p"; text: string } | { type: "ul"; items: string[] };
export type DescriptionSection = { title: string; blocks: DescriptionBlock[] };
export type ParsedDescription = { intro: DescriptionBlock[]; sections: DescriptionSection[] };

export function parseDescription(paragraphs: string[]): ParsedDescription {
  const intro: DescriptionBlock[] = [];
  const sections: DescriptionSection[] = [];
  let target = intro;
  for (const raw of paragraphs) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      const section = { title: line.slice(3).trim(), blocks: [] };
      sections.push(section);
      target = section.blocks;
    } else if (line.startsWith("- ")) {
      const last = target[target.length - 1];
      const item = line.slice(2).trim();
      if (last?.type === "ul") last.items.push(item);
      else target.push({ type: "ul", items: [item] });
    } else {
      target.push({ type: "p", text: line });
    }
  }
  return { intro, sections };
}

/** Rozdělí text na části s příznakem tučně (`**…**`); neuzavřené hvězdičky zůstanou textem. */
export function splitBold(text: string): { text: string; bold: boolean }[] {
  const parts: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(re)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), bold: false });
    parts.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts;
}
