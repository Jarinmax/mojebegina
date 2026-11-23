// Jardova karta — výpočet odměn PODLE „Dohody o odměňování prodejce za
// získávání a rozvoj zákazníků Beginy“ ze dne 14. 11. 2026 (Jaroslav Viner –
// Jaroslav Blahout). Čistá logika bez databáze; čísla v závorkách odkazují na
// body dohody. Nic se tu neodhaduje — co dohoda neurčuje, se nepočítá.
//
//   (1) Nový zákazník: dosud nenakoupil a začne díky práci prodejce —
//       5 % ze zaplacených objednávek během prvních 6 měsíců od první
//       objednávky, pak 3 %; bonus 1 000 Kč, když během prvních 6 měsíců
//       nakoupí zboží celkem alespoň za 15 000 Kč.
//   (2) Obnovený zákazník: už nakupoval, ale před oslovením alespoň 3 měsíce
//       neobjednal a díky prodejci začne znovu — 3 % ze všech zaplacených
//       objednávek od obnovení; bonus 1 000 Kč při 15 000 Kč do 6 měsíců od
//       obnovení; bonus za obnovení jen jednou.
//   (3) Aktivní zákazník – další produkt: 3 % jen z nově zavedeného produktu
//       (předem zaznamenaného), ne z dřív kupovaných produktů; jiná velikost
//       balení není nový produkt (produkt = products.id, ne balení); bez bonusu.
//   (4) Zákazník a typ odměňování se evidují PŘED oslovením (u rozpracovaných
//       kontaktů se doplní při podpisu); první nákup musí vzniknout díky
//       obchodní činnosti prodejce — v MojeBegina = Jardův zapsaný hovor po
//       evidenci a před nákupem; počítá se i e-shop; základ = cena zboží po
//       slevách, bez dopravy (Begina je neplátce DPH, ceny jsou bez DPH);
//       jen zaplacené a nevrácené (MojeBegina vrací vždy celou objednávku —
//       storno); provize se nesčítají (jedna evidence na kontakt); vyúčtování
//       měsíčně (podle měsíce zaplacení).
//   (6) Rozpracované kontakty z doby před podpisem: odměňování výslovně
//       potvrzené při podpisu (basis = confirmed_at_signing).
import { DateTime } from "luxon";

export const CONTRACT = {
  title: "Dohoda o odměňování prodejce ze dne 14. 11. 2026",
  newFirstPeriodPercent: 5,
  regularPercent: 3,
  firstPeriodMonths: 6,
  bonusKc: 1000,
  bonusThresholdKc: 15000,
  renewedGapMonths: 3,
} as const;

const ZONE = "Europe/Prague";

export type RewardType = "new" | "renewed" | "upsell";
export type RewardBasis = "contract" | "confirmed_at_signing";

export const REWARD_TYPE_LABEL: Record<RewardType, string> = {
  new: "Nový zákazník",
  renewed: "Obnovený zákazník",
  upsell: "Aktivní zákazník – další produkt",
};

export type RewardAssignment = {
  leadId: string;
  type: RewardType;
  basis: RewardBasis;
  /** Kdy prodejce typ navrhl (nebo vedení zapsalo) — rozhoduje „před oslovením“ (bod 4). */
  recordedAt: Date;
  /** Potvrzení vedením; bez něj se odměna nepočítá (prodejce typ jen navrhuje). */
  confirmedAt: Date | null;
  /** Jen u typu upsell: předem zaznamenané nové produkty (products.id). */
  upsellProductIds: string[];
  note: string | null;
};

export type RewardLead = {
  id: string;
  displayName: string;
  convertedOrganizationId: string | null;
  /** Všechny hovory zapsané Jardou u kontaktu. */
  jardaCallTimes: Date[];
};

export type RewardOrderItem = { productId: string | null; productName: string; lineTotalKc: number };

export type RewardOrder = {
  id: string;
  orderNumber: string | null;
  orderedAt: Date;
  paidAt: Date | null;
  buyerOrganizationId: string | null;
  sourceLeadId: string | null;
  subtotalKc: number;
  discountKc: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  items: RewardOrderItem[];
};

// Faktury vystavené mimo e-shop dřív, než je MojeBegina evidovala jako
// objednávky (zdroj: archiv Google Sheets „Příjmy 2026“, ověřeno 23. 11. 2026
// s Lucií). Započítávají se do odměny stejně jako objednávky z e-shopu.
export const LEGACY_REWARD_ORDERS: readonly RewardOrder[] = [
  {
    id: "legacy-20260194",
    orderNumber: "fakt. 20260194",
    orderedAt: new Date("2026-10-22T09:00:00Z"),
    paidAt: new Date("2026-10-22T09:00:00Z"),
    buyerOrganizationId: "62e8cddb-a7b1-4941-a052-2e98658917af", // VIP Dogs s.r.o. (Cats & Coffee)
    sourceLeadId: "59d3e1f5-efab-4771-a798-d4a63052abbb",
    subtotalKc: 758,
    discountKc: 0,
    paymentStatus: "paid",
    fulfillmentStatus: "delivered",
    items: [],
  },
  {
    id: "legacy-20260201",
    orderNumber: "fakt. 20260201",
    orderedAt: new Date("2026-10-30T09:00:00Z"),
    paidAt: new Date("2026-10-30T09:00:00Z"),
    buyerOrganizationId: "62e8cddb-a7b1-4941-a052-2e98658917af",
    sourceLeadId: "59d3e1f5-efab-4771-a798-d4a63052abbb",
    subtotalKc: 1137,
    discountKc: 0,
    paymentStatus: "paid",
    fulfillmentStatus: "delivered",
    items: [],
  },
];

export type RewardLine = {
  orderId: string;
  orderNumber: string | null;
  orderedAt: Date;
  /** Měsíc vyúčtování YYYY-MM (podle zaplacení). */
  month: string;
  kind: "commission" | "bonus";
  label: string;
  baseKc: number;
  percent: number | null;
  amountKc: number;
};

export type RewardCustomer = {
  leadId: string;
  displayName: string;
  type: RewardType;
  basis: RewardBasis;
  note: string | null;
  approachAt: Date;
  startAt: Date;
  firstPeriodEndsAt: Date | null;
  paidGoodsKc: number;
  bonus: { eligible: boolean; progressKc: number; reached: boolean; deadlineAt: Date | null };
  lines: RewardLine[];
  totalKc: number;
  upsellProducts: string[];
};

export type ExclusionReason =
  | "no_assignment"
  | "not_confirmed"
  | "no_call_after_assignment"
  | "bought_before_approach"
  | "not_renewed_gap"
  | "product_already_bought"
  | "no_order_after_approach";

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  no_assignment: "chybí evidence typu zákazníka (bod 4)",
  not_confirmed: "návrh typu zákazníka zatím nepotvrdilo vedení",
  no_call_after_assignment: "žádný Jardův hovor po evidenci (bod 4)",
  bought_before_approach: "nakupoval už před oslovením, nejde o nového zákazníka (bod 1)",
  not_renewed_gap: "před oslovením neobjednal-a alespoň 3 měsíce nebylo splněno (bod 2)",
  product_already_bought: "zaznamenaný produkt už zákazník dřív kupoval (bod 3)",
  no_order_after_approach: "zatím žádná objednávka po oslovení",
};

export type Excluded = { leadId: string; displayName: string; reason: ExclusionReason; paidGoodsKc: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthOf = (d: Date) => DateTime.fromJSDate(d, { zone: ZONE }).toFormat("yyyy-MM");
const plusMonths = (d: Date, months: number) => DateTime.fromJSDate(d, { zone: ZONE }).plus({ months }).toJSDate();
const isPaid = (o: RewardOrder) => o.paymentStatus === "paid";
const orderGoodsKc = (o: RewardOrder) => o.subtotalKc - o.discountKc;

/** Podíl řádků daných produktů na zboží po slevě (sleva je na celé objednávce). */
function productGoodsKc(o: RewardOrder, productIds: ReadonlySet<string>): number {
  const lines = o.items.filter((i) => i.productId !== null && productIds.has(i.productId)).reduce((s, i) => s + i.lineTotalKc, 0);
  if (lines === 0 || o.subtotalKc <= 0) return 0;
  return round2((lines * orderGoodsKc(o)) / o.subtotalKc);
}

export function computeJardaRewards(
  leads: readonly RewardLead[],
  assignments: readonly RewardAssignment[],
  orders: readonly RewardOrder[]
): { customers: RewardCustomer[]; excluded: Excluded[] } {
  const customers: RewardCustomer[] = [];
  const excluded: Excluded[] = [];
  const assignmentByLead = new Map(assignments.map((a) => [a.leadId, a]));

  for (const lead of leads) {
    const own = orders
      .filter(
        (o) =>
          o.fulfillmentStatus !== "cancelled" &&
          (o.sourceLeadId === lead.id || (lead.convertedOrganizationId !== null && o.buyerOrganizationId === lead.convertedOrganizationId))
      )
      .sort((a, b) => a.orderedAt.getTime() - b.orderedAt.getTime());
    const paidGoodsAll = own.filter(isPaid).reduce((s, o) => s + orderGoodsKc(o), 0);
    const assignment = assignmentByLead.get(lead.id);

    if (!assignment) {
      if (own.length > 0) excluded.push({ leadId: lead.id, displayName: lead.displayName, reason: "no_assignment", paidGoodsKc: paidGoodsAll });
      continue;
    }

    // Bez objednávky není co počítat ani vyřazovat — kontakt čeká (sekce „zatím bez nákupu“).
    if (own.length === 0) continue;

    // Prodejce typ jen navrhuje; počítá se až potvrzený vedením.
    if (!assignment.confirmedAt) {
      excluded.push({ leadId: lead.id, displayName: lead.displayName, reason: "not_confirmed", paidGoodsKc: paidGoodsAll });
      continue;
    }

    const exclude = (reason: ExclusionReason) => excluded.push({ leadId: lead.id, displayName: lead.displayName, reason, paidGoodsKc: paidGoodsAll });

    // Oslovení = první Jardův hovor; u evidence podle dohody až PO evidenci.
    const calls = [...lead.jardaCallTimes].sort((a, b) => a.getTime() - b.getTime());
    const approach = assignment.basis === "contract" ? calls.find((c) => c.getTime() >= assignment.recordedAt.getTime()) : calls[0];
    if (!approach) {
      exclude("no_call_after_assignment");
      continue;
    }
    const before = own.filter((o) => o.orderedAt.getTime() < approach.getTime());
    const after = own.filter((o) => o.orderedAt.getTime() >= approach.getTime());

    if (assignment.type === "new" && before.length > 0) {
      exclude("bought_before_approach");
      continue;
    }
    if (assignment.type === "renewed") {
      const last = before[before.length - 1];
      if (!last || last.orderedAt.getTime() > plusMonths(approach, -CONTRACT.renewedGapMonths).getTime()) {
        exclude("not_renewed_gap");
        continue;
      }
    }

    let upsellIds = new Set<string>();
    let upsellNames: string[] = [];
    if (assignment.type === "upsell") {
      const boughtBefore = new Set(before.flatMap((o) => o.items.map((i) => i.productId)).filter((p): p is string => p !== null));
      upsellIds = new Set(assignment.upsellProductIds.filter((p) => !boughtBefore.has(p)));
      if (upsellIds.size === 0) {
        exclude("product_already_bought");
        continue;
      }
      upsellNames = [...new Set(after.flatMap((o) => o.items.filter((i) => i.productId && upsellIds.has(i.productId)).map((i) => i.productName)))];
    }

    const relevant = assignment.type === "upsell" ? after.filter((o) => productGoodsKc(o, upsellIds) > 0) : after;
    if (relevant.length === 0) {
      exclude("no_order_after_approach");
      continue;
    }

    const startAt = relevant[0].orderedAt;
    const firstPeriodEndsAt = assignment.type === "upsell" ? null : plusMonths(startAt, CONTRACT.firstPeriodMonths);
    const lines: RewardLine[] = [];
    let bonusProgress = 0;
    let bonusReached = false;

    for (const o of relevant) {
      if (!isPaid(o)) continue;
      const month = monthOf(o.paidAt ?? o.orderedAt);
      const inFirstPeriod = firstPeriodEndsAt !== null && o.orderedAt.getTime() < firstPeriodEndsAt.getTime();
      const base = assignment.type === "upsell" ? productGoodsKc(o, upsellIds) : orderGoodsKc(o);
      const percent =
        assignment.type === "new" && inFirstPeriod ? CONTRACT.newFirstPeriodPercent : CONTRACT.regularPercent;
      lines.push({
        orderId: o.id,
        orderNumber: o.orderNumber,
        orderedAt: o.orderedAt,
        month,
        kind: "commission",
        label: assignment.type === "upsell" ? `${percent} % z nového produktu` : `${percent} % ze zboží`,
        baseKc: base,
        percent,
        amountKc: round2((base * percent) / 100),
      });

      if (assignment.type !== "upsell" && inFirstPeriod) {
        bonusProgress += base;
        if (!bonusReached && bonusProgress >= CONTRACT.bonusThresholdKc) {
          bonusReached = true;
          lines.push({
            orderId: o.id,
            orderNumber: o.orderNumber,
            orderedAt: o.orderedAt,
            month,
            kind: "bonus",
            label: `Bonus – nákup za ${CONTRACT.bonusThresholdKc.toLocaleString("cs-CZ")} Kč do 6 měsíců`,
            baseKc: bonusProgress,
            percent: null,
            amountKc: CONTRACT.bonusKc,
          });
        }
      }
    }

    customers.push({
      leadId: lead.id,
      displayName: lead.displayName,
      type: assignment.type,
      basis: assignment.basis,
      note: assignment.note,
      approachAt: approach,
      startAt,
      firstPeriodEndsAt,
      paidGoodsKc: relevant.filter(isPaid).reduce((s, o) => s + (assignment.type === "upsell" ? productGoodsKc(o, upsellIds) : orderGoodsKc(o)), 0),
      bonus: {
        eligible: assignment.type !== "upsell",
        progressKc: round2(bonusProgress),
        reached: bonusReached,
        deadlineAt: firstPeriodEndsAt,
      },
      lines,
      totalKc: round2(lines.reduce((s, l) => s + l.amountKc, 0)),
      upsellProducts: upsellNames,
    });
  }

  const byStart = (a: RewardCustomer, b: RewardCustomer) => a.startAt.getTime() - b.startAt.getTime();
  return { customers: customers.sort(byStart), excluded };
}

/** Měsíční vyúčtování (bod 4): součet řádků podle měsíce zaplacení, nejnovější nahoře. */
export function monthlyStatements(customers: readonly RewardCustomer[]): { month: string; totalKc: number; lines: (RewardLine & { customer: string })[] }[] {
  const byMonth = new Map<string, (RewardLine & { customer: string })[]>();
  for (const c of customers) {
    for (const l of c.lines) {
      const list = byMonth.get(l.month) ?? [];
      list.push({ ...l, customer: c.displayName });
      byMonth.set(l.month, list);
    }
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, lines]) => ({ month, totalKc: round2(lines.reduce((s, l) => s + l.amountKc, 0)), lines }));
}
