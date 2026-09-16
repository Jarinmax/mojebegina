// CENTRÁLNÍ ZDROJ PRAVDY pro aktuálního zákazníka Moje Begina a jeho
// objednávky. Dashboard, členská karta, profil, iniciály v headeru,
// historie objednávek, poslední objednávka, partnerský program i
// upozornění čerpají odsud — žádná obrazovka si nedrží vlastní kopii
// zákaznických dat. Až bude k dispozici backend/WooCommerce, stačí
// nahradit obsah tohoto souboru voláním API se stejným tvarem dat.
//
// Údaje, které zatím neznáme (e-mail, telefon, členské číslo…), jsou
// `null` — obrazovky je zobrazují jako "Neuvedeno", nic se nevymýšlí.

export type CustomerAccount = {
  companyName: string;
  ico: string;
  registeredAddress: string;
  contactFirstName: string;
  contactLastName: string | null;
  initials: string;
  memberId: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
};

export const customerAccount: CustomerAccount = {
  companyName: "The Cup s.r.o.",
  ico: "11935367",
  registeredAddress: "Prvního pluku 144/14, 186 00 Praha",
  contactFirstName: "Veronika",
  contactLastName: null,
  initials: "V",
  memberId: null,
  status: "Zákazník Begina",
  email: null,
  phone: null,
};

export const contactDisplayName = customerAccount.contactLastName
  ? `${customerAccount.contactFirstName} ${customerAccount.contactLastName}`
  : customerAccount.contactFirstName;

// --- Objednávky (skutečné uhrazené faktury) -------------------------

export type OrderStatus = "Uhrazeno";

export type OrderItem = {
  name: string;
  quantity: number;
  priceKc: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  date: string;
  /** Kalendářní měsíc vystavení ve tvaru "YYYY-MM" — pro měsíční
   *  vyhodnocení partnerského programu (viz currentMonthlyPurchase). */
  monthKey: string;
  items: OrderItem[];
  products: string;
  totalKc: number;
  status: OrderStatus;
};

type RawOrder = {
  id: string;
  invoiceNumber: string;
  date: string;
  monthKey: string;
  status: OrderStatus;
  items: OrderItem[];
};

function itemsTotalKc(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.priceKc * item.quantity, 0);
}

function itemsSummary(items: OrderItem[]): string {
  return items.map((item) => `${item.quantity}× ${item.name}`).join(", ");
}

// Seřazeno od nejnovější — customerOrders[0] je poslední objednávka.
const rawOrders: RawOrder[] = [
  {
    id: "faktura-20260153",
    invoiceNumber: "20260153",
    date: "3. 9. 2026",
    monthKey: "2026-09",
    status: "Uhrazeno",
    items: [
      { name: "Dýňová polévka", quantity: 1, priceKc: 379 },
      { name: "Kulajda", quantity: 1, priceKc: 379 },
      { name: "Rajčatová polévka", quantity: 1, priceKc: 379 },
    ],
  },
  {
    id: "faktura-20260152",
    invoiceNumber: "20260152",
    date: "30. 8. 2026",
    monthKey: "2026-08",
    status: "Uhrazeno",
    items: [
      { name: "Dýňová polévka", quantity: 1, priceKc: 379 },
      { name: "Kulajda", quantity: 1, priceKc: 379 },
    ],
  },
];

export const customerOrders: Order[] = rawOrders.map((order) => ({
  id: order.id,
  orderNumber: `Faktura č. ${order.invoiceNumber}`,
  date: order.date,
  monthKey: order.monthKey,
  items: order.items,
  products: itemsSummary(order.items),
  totalKc: itemsTotalKc(order.items),
  status: order.status,
}));

export const lastOrder = customerOrders[0];

// --- Partnerský program: měsíční obrat ------------------------------
//
// "Teď" pro účely tohoto prototypu (bez backendu) — v reálném systému
// by šlo o aktuální kalendářní měsíc podle hodin serveru/API.
export const currentEvaluationMonth = "2026-09";

// Do partnerského programu se počítá jen UHRAZENÁ hodnota zboží za
// aktuální kalendářní měsíc — přesně podle partnerProgramConditions
// v mock/partnerProgram.ts. Srpnová faktura patří do srpnového
// vyhodnocení, ne do zářijového, proto se tu nesčítá dohromady.
export const currentMonthlyPurchase = customerOrders
  .filter(
    (order) =>
      order.status === "Uhrazeno" && order.monthKey === currentEvaluationMonth
  )
  .reduce((sum, order) => sum + order.totalKc, 0);

// --- Obecná marketingová data (nejsou vázaná na konkrétního zákazníka) --

export const mockPerks = [
  {
    id: 2,
    title: "Dárek k nákupu nad 990 Kč",
    subtitle: "platí do 15. 10. 2026",
  },
  {
    id: 3,
    title: "Předobjednávka nové příchutě",
    subtitle: "platí do 1. 11. 2026",
  },
];

// "Doporučte Beginu" je záměrně mimo quickLinks i bottomNavItems —
// referral program zatím nemá schválená obchodní pravidla, obrazovka
// dashboard/app/doporucit zůstává v kódu, ale bez odkazu z hlavní navigace.

export const quickLinks = [
  { icon: "history", label: "Historie objednávek", href: "/objednavky" },
  { icon: "user", label: "Můj profil", href: "/profil" },
] as const;

export const bottomNavItems = [
  { icon: "home", label: "Domů", href: "/" },
  { icon: "package", label: "Objednávky", href: "/objednavky" },
  { icon: "percent", label: "Program", href: "/partnersky-program" },
  { icon: "user", label: "Profil", href: "/profil" },
] as const;
