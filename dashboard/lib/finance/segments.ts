// Finance 1.0 — rozdělení podle zdroje/provozu přes ŠTÍTKY iDokladu
// (rozhodnutí vedení 4. 10. 2026). Žádný editor pravidel ve V1: seznam
// segmentů a názvů štítků je tady, změna = malá úprava kódu.
//
// Pravidla:
//   • právě jeden segmentový štítek → ten segment,
//   • žádný segmentový štítek → „Nezařazeno“ (důvod: bez štítku),
//   • dva různé segmentové štítky → „Nezařazeno“ (důvod: konflikt) —
//     raději viditelně nezařadit, než si jeden vybrat,
//   • dobropis bez vlastního štítku převezme segment původní faktury.
// Ostatní (nesegmentové) štítky se ignorují.
import type { FinDocument, FinSegment } from "./types";
import type { FinTag } from "./idoklad/normalize";

export const SEGMENT_LABELS: Record<FinSegment, string> = {
  b2b_begina: "B2B Begina",
  eshop: "E-shop",
  bistro_jandl: "Bistro Jandl",
  akce: "Akce",
  vyroba: "Výroba",
  rezie: "Režie",
  nezarazeno: "Nezařazeno",
};

export const SEGMENT_ORDER: FinSegment[] = [
  "b2b_begina",
  "eshop",
  "bistro_jandl",
  "akce",
  "vyroba",
  "rezie",
  "nezarazeno",
];

// Název štítku v iDokladu → segment. Porovnává se bez diakritiky, velikosti
// písmen a rozdílů v mezerách/pomlčkách („E-shop“ = „eshop“ = „E shop“).
const TAG_NAME_TO_SEGMENT: Record<string, Exclude<FinSegment, "nezarazeno">> = {
  b2bbegina: "b2b_begina",
  eshop: "eshop",
  bistrojandl: "bistro_jandl",
  akce: "akce",
  vyroba: "vyroba",
  rezie: "rezie",
};

export function normalizeTagName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type SegmentAssignment = {
  segment: FinSegment;
  reason: "tag" | "inherited_from_invoice" | "no_tag" | "conflicting_tags";
};

export function segmentFromTags(tagIds: number[], tags: ReadonlyMap<number, FinTag>): SegmentAssignment {
  const found = new Set<Exclude<FinSegment, "nezarazeno">>();
  for (const id of tagIds) {
    const tag = tags.get(id);
    if (!tag) continue;
    const segment = TAG_NAME_TO_SEGMENT[normalizeTagName(tag.name)];
    if (segment) found.add(segment);
  }
  if (found.size === 1) return { segment: [...found][0], reason: "tag" };
  if (found.size > 1) return { segment: "nezarazeno", reason: "conflicting_tags" };
  return { segment: "nezarazeno", reason: "no_tag" };
}

export function assignSegment(
  doc: FinDocument,
  tags: ReadonlyMap<number, FinTag>,
  creditedInvoice: FinDocument | undefined
): SegmentAssignment {
  const own = segmentFromTags(doc.tagIds, tags);
  if (own.reason === "no_tag" && doc.docType === "credit_note" && creditedInvoice) {
    const inherited = segmentFromTags(creditedInvoice.tagIds, tags);
    if (inherited.reason === "tag") return { segment: inherited.segment, reason: "inherited_from_invoice" };
  }
  return own;
}
