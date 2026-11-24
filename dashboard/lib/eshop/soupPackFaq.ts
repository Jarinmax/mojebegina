// Časté otázky „Jak ochutnat polévky a sirupy?“ (Lucie a ChatGPT 24. 11. 2026):
// na začátek odpovědi samostatná Ochutnávka polévek 3 × 450 ml s odkazem
// „Vybrat 3 polévky“. Částky se počítají z ceny sady a aktuální chlazené
// dopravy pro samostatnou objednávku (stejný ceník jako košík a pokladna).
import { formatKc } from "@/lib/format";
import { SOUP_PACK_BUTTON, SOUP_PACK_SLUG } from "./soupPack";

export type SoupPackOffer = { priceKc: number; totalKc: number };
export type FaqLink = { label: string; href: string };
export type LiveFaqItem = { question: string; answer: string; lead?: string; rest?: string; link?: FaqLink };

export const TASTING_QUESTION_PREFIX = "Jak ochutnat polévky a sirupy";

export function soupPackFaqLead(offer: SoupPackOffer): string {
  return `Chcete ochutnat jen polévky? Vyberte si tři různé druhy po 450 ml. Při osobním odběru ve Viticích stojí sada ${formatKc(offer.priceKc)}, s chlazenou dopravou po ČR celkem ${formatKc(offer.totalKc)}.`;
}

/** Doplní ochutnávku polévek na začátek odpovědi o ochutnávce; bez nabídky (není v katalogu) beze změny. */
export function withSoupPackLead<T extends { question: string; answer: string }>(items: readonly T[], offer: SoupPackOffer | null): (T & LiveFaqItem)[] {
  return items.map((item) => {
    if (!offer || !item.question.startsWith(TASTING_QUESTION_PREFIX)) return { ...item };
    const lead = soupPackFaqLead(offer);
    return { ...item, answer: `${lead} ${item.answer}`, lead, rest: item.answer, link: { label: SOUP_PACK_BUTTON, href: `/produkt/${SOUP_PACK_SLUG}` } };
  });
}
