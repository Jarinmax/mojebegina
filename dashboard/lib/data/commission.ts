// Jarda – volání a provize, část 2 — 3% provize z dalších nákupů a
// jednorázový akviziční bonus 1 000 Kč.
//
// Obratová základna pro OBOJÍ (provizi i hranici bonusu): zaplacené zboží
// bez dopravy, po slevách — SUM(subtotal_kc - discount_kc) — přesně to,
// co orders.ts/schema.ts odjakživa nazývá "partnerský obrat" (komentář u
// discountKc). Počítá se jen z objednávek, které JSOU zaplacené
// (paymentStatus = 'paid') a NEJSOU stornované (fulfillmentStatus <>
// 'cancelled'). V tomhle kodexu vratka vždy nejdřív stornuje celou
// objednávku (lib/eshop/cancellation.ts — žádné dílčí vratky, platba po
// stornu NIKDY nepřepne na Zaplaceno), takže tahle jediná dvojice
// podmínek (zaplaceno + nestornováno) správně vyřadí JAK storna, TAK
// vratky bez nutnosti sahat do payments / order_payment_balance.
export const COMMISSION_RATE = 0.03;
export const ACQUISITION_BONUS_KC = 1000;
export const ACQUISITION_BONUS_THRESHOLD_KC = 15000;
// "Šest měsíců" počítáno jako 183 dní (bez kalendářní aritmetiky měsíců —
// stabilní, nezávislé na délce konkrétních měsíců).
export const ACQUISITION_BONUS_WINDOW_DAYS = 183;

export type CommissionOrderRow = {
  subtotalKc: number;
  discountKc: number;
  orderedAt: Date;
};

export type BonusStatus = "unknown" | "not_eligible" | "running" | "reached" | "paid";

export type CommissionAndBonus = {
  /** Zaplacené zboží (bez dopravy, po slevách) započítané do PROVIZE aktuálního správce. */
  commissionBaseKc: number;
  commissionKc: number;
  /**
   * Od kdy se objednávky počítají do provize aktuálního správce — null =
   * "od začátku" (currentOwnerSince chybí: organizace bez záznamu v
   * organization_owner_history, typicky dřív než migrace 0023 doběhla
   * backfill). Není to totéž co commissionBaseKc = 0.
   */
  commissionSince: Date | null;
  /** false = u tohoto zákazníka se akviziční bonus nedá vůbec nárokovat (chybí data, nebo už nakupoval před acquiredAt). */
  bonusEligible: boolean;
  bonusStatus: BonusStatus;
  /** Zaplacené zboží v okně acquiredAt..acquiredAt+183 dní (zastropováno koncem okna, ne "teď"). */
  bonusProgressKc: number;
  bonusRemainingKc: number;
  bonusDeadlineAt: Date | null;
  /** Dny do konce lhůty vzhledem k `now` z ComputeCommissionInput — nikdy Date.now() v komponentě (React purity). */
  bonusDaysLeft: number | null;
  bonusPaidAt: Date | null;
};

function paidGoodsKc(orders: readonly CommissionOrderRow[], since: Date | null, until?: Date): number {
  return orders
    .filter((o) => (since === null || o.orderedAt >= since) && (!until || o.orderedAt <= until))
    .reduce((sum, o) => sum + (o.subtotalKc - o.discountKc), 0);
}

export type ComputeCommissionInput = {
  /** VŠECHNY zaplacené, nestornované objednávky organizace (libovolný tehdejší vlastník). */
  orders: readonly CommissionOrderRow[];
  /**
   * started_at aktuálně OTEVŘENÉHO období z organization_owner_history
   * (append-only, nikdy přepisované — viz assignCustomerOwner). null =
   * žádné otevřené období (dosud nenasazená migrace / zákazník bez
   * obchodníka) → provize se počítá ze všech historických objednávek.
   */
  currentOwnerSince: Date | null;
  acquiredByUserId: string | null;
  acquiredAt: Date | null;
  bonusPaidAt: Date | null;
  now: Date;
};

export function computeCommissionAndBonus(input: ComputeCommissionInput): CommissionAndBonus {
  const commissionBaseKc = paidGoodsKc(input.orders, input.currentOwnerSince);
  const commissionKc = Math.round(commissionBaseKc * COMMISSION_RATE);

  let bonusEligible = false;
  let bonusStatus: BonusStatus = "unknown";
  let bonusProgressKc = 0;
  let bonusRemainingKc = ACQUISITION_BONUS_THRESHOLD_KC;
  let bonusDeadlineAt: Date | null = null;
  let bonusDaysLeft: number | null = null;

  if (input.acquiredByUserId && input.acquiredAt) {
    const acquiredAt = input.acquiredAt;
    const deadline = new Date(acquiredAt.getTime() + ACQUISITION_BONUS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    bonusDeadlineAt = deadline;
    bonusDaysLeft = Math.max(0, Math.ceil((deadline.getTime() - input.now.getTime()) / 86_400_000));

    // Rule 2: "Přidělení zákazníka, který už nakupoval, novému správci
    // akviziční bonus nikdy nezakládá." — nezávislá pojistka na úrovni
    // výpočtu, nezávisí na tom, jak/kdy se acquiredAt zapsal.
    const hadPriorPurchase = input.orders.some((o) => o.orderedAt < acquiredAt);

    if (hadPriorPurchase) {
      bonusStatus = "not_eligible";
    } else {
      bonusEligible = true;
      bonusProgressKc = paidGoodsKc(input.orders, acquiredAt, deadline);
      bonusRemainingKc = Math.max(0, ACQUISITION_BONUS_THRESHOLD_KC - bonusProgressKc);

      if (input.bonusPaidAt) {
        bonusStatus = "paid";
      } else if (bonusProgressKc >= ACQUISITION_BONUS_THRESHOLD_KC) {
        bonusStatus = "reached";
      } else if (input.now <= deadline) {
        bonusStatus = "running";
      } else {
        bonusStatus = "not_eligible"; // lhůta vypršela, hranice nedosažena
      }
    }
  }

  return {
    commissionBaseKc,
    commissionKc,
    commissionSince: input.currentOwnerSince,
    bonusEligible,
    bonusStatus,
    bonusProgressKc,
    bonusRemainingKc,
    bonusDeadlineAt,
    bonusDaysLeft,
    bonusPaidAt: input.bonusPaidAt,
  };
}
