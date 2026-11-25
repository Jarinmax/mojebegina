// llms.txt (https://llmstxt.org) — popis Beginy pro jazykové modely (Lucie 20. 11. 2026).
// Jen údaje, které už jsou na webu; žádná zdravotní tvrzení, nic „bez lepku“.
import { PUBLIC_ORIGIN } from "./hosts";
import { LANDING_PAGES } from "@/lib/eshop/landingPages";
import { OPERATOR } from "@/lib/eshop/operator";
import { syrupModelLine } from "@/lib/eshop/portionPrices";

const link = (title: string, path: string, note?: string) => `- [${title}](${PUBLIC_ORIGIN}${path})${note ? `: ${note}` : ""}`;

export function llmsTxt(): string {
  return [
    "# Begina",
    "",
    "> Begina dováží hotové polévky a nápoje pro kavárny a bistra po celé ČR chlazenou přepravou: čerstvé polévky, bylinné sirupy, čaje a ovocné nápoje v begině, třílitrovém sáčku s kohoutkem. Objednat si můžete i domů.",
    "",
    "- Pro koho: hlavně kavárny a bistra, ale i zákazníci domů.",
    "- Polévky a nealkoholické nápoje jsou 100% rostlinné, vhodné pro vegany i vegetariány. Vyrábíme je z čisté filtrované vody; sirupy, čaje a ovocné nápoje jsou bez konzervantů.",
    `- Polévka v begině 3 l stojí 379 Kč a vystačí až na 12 porcí po 250 ml (31,58 Kč za porci). Nápoj ze sirupu: ${syrupModelLine(true)}`,
    "- Polévky a čaje vydrží po otevření v lednici 14 dní, sirupy 3 měsíce.",
    "- Doprava: chlazená přeprava po celé ČR (cena podle hmotnosti), sáčky se sirupem i Zásilkovnou, osobní odběr v Zahradním bistru Begina, Vitice 119, 281 06 Vitice.",
    "- Objednávka přímo na e-shopu begina.cz, na firmu i s IČO. Ceny jsou stejné jako na e-shopu, při pravidelném odběru sleva 3 až 7 % v partnerském programu.",
    `- Kontakt: ${OPERATOR.email}, ${OPERATOR.phone}.`,
    "",
    "## Hlavní stránky",
    link("Úvod", "/"),
    link("Pro kavárny a bistra", "/pro-kavarny", "spolupráce a ochutnávka do provozu"),
    link("Časté otázky", "/caste-otazky"),
    link("Čerstvé polévky", "/kategorie/polevky"),
    link("Bylinné sirupy", "/kategorie/sirupy"),
    link("Čaje", "/kategorie/caje"),
    link("Ovocné nápoje", "/kategorie/ovocne-napoje"),
    link("Doprava", "/doprava"),
    link("O nás", "/o-nas"),
    link("Partnerský program", "/partnersky-program"),
    "",
    "## Pro gastro",
    ...LANDING_PAGES.map((page) => link(page.title, page.path)),
    "",
  ].join("\n");
}
