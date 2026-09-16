// Mock data pro Centrum upozornění. Partnerské notifikace jsou POČÍTANÉ
// ze stejného centrálního zdroje pravidel (getPartnerTierStatus nad
// partnerTiers a currentMonthlyPurchase) jako dashboard a
// /vyhoda/partnerska-sleva — žádné procento ani hranice tu nejsou
// napsané ručně. Marketingové notifikace jsou čistě mock, bez jakékoli
// obchodní logiky.

import { formatKc } from "@/lib/format";
import { getPartnerTierStatus } from "@/lib/partnerTier";
import { partnerTiers } from "@/mock/partnerProgram";
import { currentMonthlyPurchase } from "@/mock/customer";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href?: string;
  read: boolean;
};

const { currentTier, nextTier, remaining } = getPartnerTierStatus(
  currentMonthlyPurchase,
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

export const notifications: NotificationItem[] = [
  ...partnerNotifications,
  ...marketingNotifications,
];

export const unreadNotificationCount = notifications.filter(
  (n) => !n.read
).length;
