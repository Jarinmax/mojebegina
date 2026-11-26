// Taháček k hovoru (Lucie 27. 11. 2026) — krátká verze manuálu na jednu stránku,
// zobrazená nahoře na stránce Manuál pro obchodníky a ke stažení jako PDF.
// Porce polévky s dopravou se počítá stejně jako na webu (aktuální palivový příplatek).
import { renderDocument, type DocLine } from "@/lib/eshop/legal/termsPdf";
import { kc, soupPortionRows } from "@/lib/eshop/portionPrices";

export const CALL_CHEATSHEET_TITLE = "Taháček k hovoru";
export const CALL_CHEATSHEET_PDF_FILENAME = "Begina-tahacek-k-hovoru.pdf";

export type CheatsheetSection = {
  title: string;
  tone?: "warning";
  /** Odstavce bez odrážky. */
  paragraphs?: string[];
  items?: string[];
};

const soupPortion = () => kc(soupPortionRows([3])[0].perPortionKc);

export function callCheatsheetSections(): CheatsheetSection[] {
  return [
    {
      title: "Cíl hovoru",
      paragraphs: [
        "Jediný cíl: první objednávka. Buď první begina 3 l (k ní 2 vzorky polévek + 2 vzorky sirupů zdarma), nebo Ochutnávka polévek 3 × 450 ml (299 Kč při osobním odběru ve Viticích) či set sirupů 5 × 100 ml (349 Kč). Objednávají sami na begina.cz.",
      ],
    },
    {
      title: "1. Úvod (10 vteřin)",
      paragraphs: [
        "„Dobrý den, tady Jarda (Jarin) z Beginy – děláme chlazené polévky a sirupy ve 3l balení s kohoutkem pro kavárny. Máte prosím minutu?“ U staršího leadu: „Před časem jste se zajímal/a o naše polévky, navazuju na to.“",
      ],
    },
    {
      title: "2. Tři otázky",
      items: [
        "Kolik polévek denně prodáte (nebo byste chtěli prodávat)?",
        "Jak to řešíte dnes – vaříte sami, nebo kupujete? Co vám na tom vadí?",
        "Kam vám můžu poslat odkaz na první objednávku se vzorky?",
      ],
    },
    {
      title: "3. Argumenty (vyber 1–2)",
      items: [
        "Bez práce: polévku jen ohřát, sirup naředit. Z kohoutku natočíte jen objednanou porci.",
        "Po otevření vydrží v lednici: polévky 14 dní, sirupy 3 měsíce.",
        `Porce polévky 250 ml od ${soupPortion()} včetně chlazené dopravy (při objednávce 3 × 3 l).`,
        "Polévky už přes rok objednávají kavárny v centru Prahy (kavárnu nejmenovat).",
        "Polévky a nealko nápoje jsou 100% rostlinné. Chlazená doprava po celé ČR.",
      ],
    },
    {
      title: "Konzervanty – říkat přesně",
      tone: "warning",
      paragraphs: [
        "„Konzervanty nepřidáváme. Jediné, co přidáváme, je vitamin C jako antioxidant.“ Nikdy neříkat „žádná éčka“ (kokosové mléko, pasírovaná rajčata a Aperol je obsahují). Detaily v podrobném manuálu.",
      ],
    },
    {
      title: "4. Námitky",
      items: [
        `„Je to drahé.“ → „Porce 250 ml vychází od ${soupPortion()} i s dopravou. Za kolik prodáváte polévku?“`,
        "„Vaříme si sami.“ → „K první begině máte 2 vzorky polévek a 2 sirupů zdarma – porovnejte.“",
        "„Teď ne.“ → „Kdy vám mám zavolat?“ – a zapiš přesný termín.",
        "„Pošlete e-mail.“ → Pošli odkaz begina.cz/pro-kavarny a domluv termín dalšího hovoru.",
      ],
    },
    {
      title: "5. Po hovoru – povinně do MojeBeginy",
      items: [
        "Výsledek hovoru + odkud nás zná.",
        "Další krok a datum – žádný lead bez termínu.",
        "Hned SMS nebo e-mail s odkazem begina.cz/pro-kavarny.",
      ],
    },
    {
      title: "Kadence a rytmus",
      paragraphs: [
        "Max. 5 kontaktů: den 1 hovor + SMS/e-mail → den 3 → den 10 → den 20 poslední e-mail → pak jen newsletter. Volat 9:30–11:00 a 14:00–16:00. Cíl: Jarda 8 hovorů denně, Jarin 4.",
      ],
    },
  ];
}

/** Font PDF nemá šipky — v PDF je nahradí pomlčka. */
const pdfSafe = (t: string) => t.replace(/→/g, "–");

export function callCheatsheetDocument(): DocLine[] {
  const lines: DocLine[] = [{ kind: "text", style: "title", text: `Begina – ${CALL_CHEATSHEET_TITLE.toLowerCase()}`, indent: 0 }];
  for (const section of callCheatsheetSections()) {
    lines.push({ kind: "text", style: "heading", text: pdfSafe(section.title), indent: 0 });
    for (const p of section.paragraphs ?? []) lines.push({ kind: "text", style: "body", text: pdfSafe(p), indent: 0 });
    for (const item of section.items ?? []) lines.push({ kind: "text", style: "body", text: pdfSafe(item), indent: 14, marker: "•" });
  }
  return lines;
}

export async function callCheatsheetPdf(now: Date = new Date()): Promise<Uint8Array> {
  return renderDocument(callCheatsheetDocument(), {
    header: `Begina – ${CALL_CHEATSHEET_TITLE.toLowerCase()}`,
    title: `Begina – ${CALL_CHEATSHEET_TITLE.toLowerCase()}`,
    subject: "Krátký postup k hovoru s kavárnou nebo bistrem",
    fixedDate: now,
  });
}
