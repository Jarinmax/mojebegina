// Data pro Centrum upozornění. Partnerské notifikace jsou POČÍTANÉ ze
// stejného centrálního zdroje pravidel (getPartnerTierStatus nad
// partnerTiers) jako dashboard a /vyhoda/partnerska-sleva — žádné
// procento ani hranice tu nejsou napsané ručně. Marketingové notifikace
// jsou čistě mock, bez jakékoli obchodní logiky.
//
// Security Phase 2.3: monthlyPurchase už nepřichází z mock konstanty, ale
// jako parametr — volající (stránka) ho dodá z reálné, autorizované DB
// hodnoty (lib/data/dashboard.ts). Tenhle soubor sám o sobě žádná
// zákaznická data nečte.

import { formatKc } from "@/lib/format";
import { getPartnerTierStatus } from "@/lib/partnerTier";
import { partnerTiers } from "@/mock/partnerProgram";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href?: string;
  read: boolean;
};

const marketingNotifications: NotificationItem[] = [
  {
    id: "marketing-perk",
    title: "Máte aktivní výhodu",
    body: "Dárek k nákupu nad 990 Kč — platí do 15. 10. 2026.",
    read: false,
  },
  {
    id: "marketing-news",
    title: "Novinka / akce Begina",
    body: "Vyzkoušejte novou příchuť Begina Limitovaná edice — teď v akci.",
    read: true,
  },
];

export function getNotifications(monthlyPurchase: number): NotificationItem[] {
  const { currentTier, nextTier, remaining } = getPartnerTierStatus(
    monthlyPurchase,
    partnerTiers
  );

  const partnerNotifications: NotificationItem[] = [];

  if (nextTier) {
    partnerNotifications.push({
      id: "partner-next-tier",
      title: "Blížíte se k další úrovni",
      body: `Do ${
        nextTier.discountPercent
          ? `slevy ${nextTier.discountPercent} %`
          : nextTier.discountLabel
      } vám chybí už jen ${formatKc(remaining)}.`,
      href: "/vyhoda/partnerska-sleva",
      read: false,
    });
  }

  partnerNotifications.push({
    id: "partner-current-tier",
    title: "Vaše partnerská sleva",
    body: currentTier.discountPercent
      ? `Aktuálně máte partnerskou úroveň ${currentTier.discountPercent} %. Získaná sleva platí pro objednávky v následujícím měsíci.`
      : `Zatím nakupujete za standardní ceny. Od ${
          nextTier ? formatKc(nextTier.minAmount) : ""
        } měsíčně získáte první partnerskou slevu.`,
    href: "/partnersky-program",
    read: false,
  });

  return [...partnerNotifications, ...marketingNotifications];
}

export function getUnreadCount(notifications: NotificationItem[]): number {
  return notifications.filter((n) => !n.read).length;
}
