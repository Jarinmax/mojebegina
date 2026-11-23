// Text manuálu pro obchodníky (Lucie 20. 11. 2026) — přepis PDF
// „Begina – manuál pro obchodníky“, ať se dá číst přímo v MojeBegina i na
// mobilu při hovoru. Při nové verzi PDF upravit i tenhle text, datum a
// lib/obchod/salesManualPdf.ts.
import { kc, soupPortionRows, syrupModelKc } from "@/lib/eshop/portionPrices";

export type ManualSection = {
  title: string;
  /** Zvýraznění sekce (např. „Nikdy neříkat“). */
  tone?: "warning";
  items: { text: string; note?: string }[];
};

export const SALES_MANUAL_TITLE = "Begina – manuál pro obchodníky";
export const SALES_MANUAL_SUBTITLE = "Co říkat kavárnám a bistrům při hovorech na leady";
export const SALES_MANUAL_UPDATED = "23. 11. 2026";

export const SALES_MANUAL_SECTIONS: ManualSection[] = [
  {
    title: "Hlavní argumenty",
    items: [
      {
        text: "Z kohoutku natočíte vždy jen objednanou porci. Po otevření vydrží v lednici polévky a čaje 14 dní, sirupy 3 měsíce.",
      },
      { text: "Bez práce: polévku stačí ohřát a podávat, nápoje jen naředit." },
      {
        get text() {
          return `Spočítané porce (s dopravou, při 3 × 3 l): polévka 250 ml od ${kc(soupPortionRows([3])[0].perPortionKc)}, nápoj ze sirupu 200 ml od ${syrupModelKc()}.`;
        },
      },
      { text: "100% rostlinné polévky a nealko nápoje – vhodné pro vegany i vegetariány." },
      { text: "Z čisté filtrované vody, recepty z vlastní kuchyně." },
      { text: "Chlazená doprava po celé ČR, osobní odběr ve Viticích. Ochutnat se dá v Zahradním bistru Begina." },
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
      { text: "U alkoholických koktejlů jsou konzervanty jen v kupovaném alkoholu (víno, Aperol)." },
    ],
  },
  {
    title: "Cukr a oleje",
    items: [
      { text: "Kde sladíme, tam jen třtinovým cukrem, ne bílým." },
      { text: "Ovocné nápoje jsou bez přidaného cukru, obsahují jen přirozené cukry z ovoce." },
      { text: "Do polévek používáme jen olivový a dýňový olej – žádný slunečnicový, řepkový ani jiný levný olej." },
      { text: "Neříkat „extra panenský“ – u olivového oleje to neplatí." },
    ],
  },
  {
    title: "Ceny (orientačně, platí ceny na begina.cz)",
    items: [
      { text: "Polévky: 379 Kč za 3 l (až 12 porcí po 250 ml)." },
      { text: "Sirupy: 549 nebo 499 Kč za 3 l (až 150 nápojů), 159 Kč za 500 ml (teď vyprodané), 199 Kč za 650 ml (doprodej)." },
      { text: "Čaje: 249–289 Kč za 3 l. Ovocné nápoje: 349 Kč, Malinový svařák – nealko 399 Kč." },
      { text: "Alkoholické koktejly: 799 Kč za 3 l, Svařák Deluxe 499 Kč za 3 l." },
      { text: "Ochutnávkový set sirupů: 349 Kč." },
    ],
  },
  {
    title: "První objednávka (jen pro kavárny a bistra)",
    items: [
      { text: "K první begině 3 l: 2 vzorky polévek (200 ml) a 2 vzorky sirupů (100 ml) zdarma." },
      { text: "Vzorky si zaškrtnou na begina.cz na stránce Pro kavárny." },
      { text: "Každý další vzorek stojí 49 Kč, z každého nejvýš 1 kus." },
      { text: "Platí jednou na jeden podnik (IČO)." },
    ],
  },
  {
    title: "Jak objednat",
    items: [
      { text: "Objednávají sami na e-shopu begina.cz, na firmu i s IČO." },
      { text: "Posíláme chlazenou přepravou po celé ČR, nebo osobní odběr ve Viticích." },
      { text: "Za pravidelné objednávky sleva v partnerském programu 3–7 %." },
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
