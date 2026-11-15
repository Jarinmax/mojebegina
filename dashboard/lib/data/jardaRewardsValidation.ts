// Jardova karta (audit 15. 11. 2026) — čistá logika bez databáze: kteří
// zákazníci Jardovi náleží a z jakého zaplaceného zboží se mu počítá odměna.
//
// Pravidlo „Jardův zákazník“ (rozhodnutí vedení 15. 11. 2026):
//   • kontakt (lead) vlastní Jarda,
//   • ke kontaktu patří objednávky — firma přes leads.converted_organization_id,
//     soukromá osoba přes orders.source_lead_id,
//   • a v MojeBegina je zapsaný JARDŮV hovor (call_logged) PŘED první
//     objednávkou. Samotný původ kontaktu z jeho tabulky nestačí.
// Kontakt, který objednal bez Jardova hovoru předem, se do odměn nepočítá
// (vedoucí ho vidí v seznamu „nezapočítáno“ s důvodem).
//
// Zaplacené zboží = SUM(subtotal_kc − discount_kc) zaplacených
// (payment_status = 'paid') a nestornovaných objednávek — bez dopravy.

export type RewardLeadRow = {
  id: string;
  displayName: string;
  convertedOrganizationId: string | null;
  /** Nejstarší hovor zapsaný Jardou u tohoto kontaktu (null = žádný). */
  firstJardaCallAt: Date | null;
};

export type RewardOrderRow = {
  id: string;
  orderNumber: string | null;
  orderedAt: Date;
  buyerOrganizationId: string | null;
  sourceLeadId: string | null;
  subtotalKc: number;
  discountKc: number;
  paymentStatus: string;
  fulfillmentStatus: string;
};

export type RewardOrderView = {
  id: string;
  orderNumber: string | null;
  orderedAt: Date;
  goodsKc: number;
  paid: boolean;
};

export type RewardCustomer = {
  leadId: string;
  displayName: string;
  organizationId: string | null;
  firstOrderAt: Date;
  firstJardaCallAt: Date;
  orders: RewardOrderView[];
  /** Zaplacené zboží bez dopravy, po slevách. */
  paidGoodsKc: number;
};

export type ExcludedCustomer = {
  leadId: string;
  displayName: string;
  firstOrderAt: Date;
  firstJardaCallAt: Date | null;
  paidGoodsKc: number;
  reason: "no_call_before_first_order";
};

const isCancelled = (o: RewardOrderRow) => o.fulfillmentStatus === "cancelled";
const goodsKc = (o: RewardOrderRow) => o.subtotalKc - o.discountKc;

export function attributeJardaCustomers(
  leads: readonly RewardLeadRow[],
  orders: readonly RewardOrderRow[]
): { customers: RewardCustomer[]; excluded: ExcludedCustomer[] } {
  const customers: RewardCustomer[] = [];
  const excluded: ExcludedCustomer[] = [];

  for (const lead of leads) {
    const own = orders
      .filter(
        (o) =>
          !isCancelled(o) &&
          (o.sourceLeadId === lead.id ||
            (lead.convertedOrganizationId !== null && o.buyerOrganizationId === lead.convertedOrganizationId))
      )
      .sort((a, b) => a.orderedAt.getTime() - b.orderedAt.getTime());
    if (own.length === 0) continue;

    const firstOrderAt = own[0].orderedAt;
    const paidGoodsKc = own.filter((o) => o.paymentStatus === "paid").reduce((sum, o) => sum + goodsKc(o), 0);

    if (lead.firstJardaCallAt === null || lead.firstJardaCallAt.getTime() >= firstOrderAt.getTime()) {
      excluded.push({
        leadId: lead.id,
        displayName: lead.displayName,
        firstOrderAt,
        firstJardaCallAt: lead.firstJardaCallAt,
        paidGoodsKc,
        reason: "no_call_before_first_order",
      });
      continue;
    }

    customers.push({
      leadId: lead.id,
      displayName: lead.displayName,
      organizationId: lead.convertedOrganizationId,
      firstOrderAt,
      firstJardaCallAt: lead.firstJardaCallAt,
      orders: own.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        orderedAt: o.orderedAt,
        goodsKc: goodsKc(o),
        paid: o.paymentStatus === "paid",
      })),
      paidGoodsKc,
    });
  }

  const byFirstOrder = <T extends { firstOrderAt: Date }>(a: T, b: T) => a.firstOrderAt.getTime() - b.firstOrderAt.getTime();
  return { customers: customers.sort(byFirstOrder), excluded: excluded.sort(byFirstOrder) };
}
