// Text manuálu pro obchodníky (Lucie 20. 11. 2026) — přepis PDF
// „Begina – manuál pro obchodníky“, ať se dá číst přímo v MojeBegina i na
// mobilu při hovoru. Při nové verzi PDF upravit i tenhle text, datum a
// lib/obchod/salesManualPdf.ts.
import { kc, soupPortionRows, syrupDrinkRows } from "@/lib/eshop/portionPrices";

export type ManualSection = {
  title: string;
  /** Zvýraznění sekce (např. „Nikdy neříkat“). */
  tone?: "warning";
  items: { text: string; note?: string }[];
};

export const SALES_MANUAL_TITLE = "Begina – manuál pro obchodníky";
export const SALES_MANUAL_SUBTITLE = "Co říkat kavárnám a bistrům při hovorech na leady";
export const SALES_MANUAL_UPDATED = "25. 11. 2026";

export const SALES_MANUAL_SECTIONS: ManualSection[] = [
  {
    title: "Hlavní argumenty",
    items: [
      {
        text: "Polévky Begina už přes rok objednávají kavárny v centru Prahy.",
        note: "Konkrétní kavárnu nejmenovat – nemáme jejich souhlas.",
      },
      {
        text: "Z kohoutku natočíte vždy jen objednanou porci. Po otevření vydrží v lednici: polévky, čaje a alkoholické koktejly 14 dní, sirupy 3 měsíce, ovocné nápoje a Malinový svařák – nealko jen 5 dní, Ochutnávka polévek 3 × 450 ml 5 dní.",
      },
      { text: "Bez práce: polévku stačí ohřát, sirup naředit a ostatní nápoje jsou hotové k podávání." },
      {
        get text() {
          // s dopravou ze stejného výpočtu jako web (aktuální palivový příplatek); PDF se generuje
          // při stažení, takže sedí s webem ten den (Lucie 24. 11. 2026)
          return `Spočítané porce včetně chlazené dopravy (při objednávce 3 × 3 l): polévka 250 ml od ${kc(soupPortionRows([3])[0].perPortionKc)}, nápoj ze sirupu 200 ml od ${kc(syrupDrinkRows([3])[0].perPortionKc)}. Stejné ceny jsou na begina.cz na stránce Pro kavárny.`;
        },
      },
      { text: "100% rostlinné polévky a nealko nápoje – vhodné pro vegany i vegetariány." },
      { text: "Z čisté filtrované vody, recepty z vlastní kuchyně." },
      { text: "Chlazená doprava po celé ČR, osobní odběr ve Viticích. Ochutnat se dá v Zahradním bistru Begina, Vitice 119, 281 06 Vitice." },
    ],
  },
  {
    title: "Konzervanty – říkat přesně takhle",
    items: [
      { text: "„Konzervanty nepřidáváme. Jediné, co přidáváme, je vitamin C jako antioxidant.“" },
      {
        text: "Nikdy neříkat „žádná éčka“. Vitamin C je sám éčko (E 300) a kokosové mléko v Dýňové polévce, Kulajdě, Špenátové polévce a Rajčatové polévce s červenou řepou obsahuje emulgátor E 435.",
      },
      {
        text: "Na dotaz: v Tomatové polévce a Rajčatové polévce s červenou řepou je kyselina citronová z pasírovaných rajčat – je to regulátor kyselosti v surovině, ne konzervant, a sami ho nepřidáváme.",
      },
      { text: "U alkoholických koktejlů: ve Svařáku Deluxe jsou siřičitany z vína, v Lady Carneval barviva E 110 a E 124 z Aperolu. Sami nic z toho nepřidáváme." },
      { text: "U Lady Carneval nikdy neříkat „bez umělých barviv“." },
    ],
  },
  {
    title: "Cukr a oleje",
    items: [
      { text: "Kde sladíme, tam jen třtinovým cukrem, ne bílým (kupovaný Aperol v Lady Carneval má vlastní cukr)." },
      { text: "Ovocné nápoje jsou bez přidaného cukru, obsahují jen přirozené cukry z ovoce." },
      { text: "Do polévek používáme jen olivový a dýňový olej – žádný slunečnicový, řepkový ani jiný levný olej." },
      { text: "Neříkat „extra panenský“ – u olivového oleje to neplatí." },
    ],
  },
  {
    title: "Ceny (orientačně, platí ceny na begina.cz)",
    items: [
      { text: "Polévky: 379 Kč za 3 l (až 12 porcí po 250 ml)." },
      { text: "Sirupy: 549 nebo 499 Kč za 3 l (až 150 nápojů), 159 Kč za 500 ml (teď vyprodané), 199 Kč za 650 ml (doprodej, jen Zázvorový sirup a Lipový sirup)." },
      { text: "Čaje: 249–289 Kč za 3 l. Ovocné nápoje: 349 Kč, Malinový svařák – nealko 399 Kč." },
      { text: "Alkoholické koktejly: 799 Kč za 3 l, Svařák Deluxe 499 Kč za 3 l." },
    ],
  },
  {
    title: "Vzorky a ochutnávky",
    items: [
      { text: "K první begině 3 l (polévka, sirup, Svařák Deluxe, Lady Carneval): 2 vzorky polévek a 2 vzorky sirupů zdarma. Bez IČO, jednou na zákazníka." },
      { text: "Další vzorky k begině po 49 Kč. Vybírají se na begina.cz na stránce Pro kavárny." },
      { text: "Bez beginy: Ochutnávka polévek 3 × 450 ml (299 Kč při osobním odběru ve Viticích, s chlazenou dopravou podle aktuálního ceníku na e-shopu) a set sirupů 5 × 100 ml (349 Kč). Kdykoli a opakovaně." },
    ],
  },
  {
    title: "Jak objednat",
    items: [
      { text: "Objednávají sami na e-shopu begina.cz. IČO vyplní, jen když chtějí nakupovat na firmu." },
      { text: "Posíláme chlazenou přepravou po celé ČR, nebo osobní odběr ve Viticích." },
      { text: "Sirupy jdou i Zásilkovnou: 1–4 sáčky, ochutnávkový set nebo jedna begina sirupu 3 l (za 89 Kč, krabice je v ceně)." },
      {
        text: "Partnerský program podle zboží za minulý měsíc (bez dopravy): nad 5 000 Kč sleva 3 %, nad 8 000 Kč 5 %, nad 12 000 Kč 7 %, nad 20 000 Kč individuální dohoda.",
      },
      { text: "Odpovědi na časté dotazy jsou na webu v menu O nás → Časté otázky." },
    ],
  },
  {
    title: "Nikdy neříkat",
    tone: "warning",
    items: [
      { text: "Žádná zdravotní tvrzení: „na imunitu“, „léčí“, „detox“, „zdravé“, „dodá energii“." },
      {
        text: "Alkoholické koktejly a Svařák Deluxe neoznačovat jako „rostlinné“ a jsou jen pro dospělé (18+).",
        note: "Proč: víno ve Svařáku Deluxe se při výrobě může čiřit živočišnými látkami (vaječný bílek, želatina, mléčná bílkovina) a my kupujeme pokaždé jiné víno, takže to nevíme jistě. Pro jednoduchost proto „rostlinné“ píšeme jen u polévek a nealko nápojů.",
      },
      { text: "Nesrovnávat se jménem s konkurencí." },
      { text: "Produkty vždy přesnými názvy z e-shopu (např. „Gulášová polévka z hlívy ústřičné“)." },
    ],
  },
];
