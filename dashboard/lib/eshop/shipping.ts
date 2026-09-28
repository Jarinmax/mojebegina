// E-shop 1.0 (náhled) — způsoby doručení a platby.
//
// ORIENTAČNÍ hodnoty pro náhled: skutečné způsoby doručení (chlazená
// doprava, rozvozové dny a oblasti, osobní odběr) a platební bránu teprve
// potvrdí vedení. Ceny se VŽDY berou odsud na serveru, nikdy z formuláře.

export type ShippingMethod = {
  id: "osobni-odber" | "rozvoz";
  label: string;
  description: string;
  priceKc: number;
  requiresAddress: boolean;
};

export const shippingMethods: ShippingMethod[] = [
  {
    id: "osobni-odber",
    // Podle skutečné objednávky z begina.cz (WooCommerce, 26. 9. 2026).
    label: "Osobní vyzvednutí — Zahradní Bistro Begina",
    description: "Areál Zahradnictví Jandl, Vitice 119, 281 06 Vitice (okr. Kolín).",
    priceKc: 0,
    requiresAddress: false,
  },
  {
    id: "rozvoz",
    label: "Chlazená přeprava",
    description: "Doručení v chladu na vaši adresu. Cena se bude počítat podle objemu objednávky, zatím orientačně.",
    priceKc: 99,
    requiresAddress: true,
  },
];

export type PaymentMethod = {
  id: "prevod" | "karta";
  label: string;
  description: string;
  available: boolean;
};

// Platba kartou (Stripe) je dostupná, jen když to povolí server
// (lib/eshop/stripe/config.ts → isCardPaymentAvailable) — výchozí stav je
// nedostupná.
export function paymentMethodsFor(cardAvailable: boolean): PaymentMethod[] {
  return [
    {
      id: "prevod",
      label: "Bankovní převod — platba předem",
      description: "Po objednávce pošleme platební údaje a QR kód.",
      available: true,
    },
    {
      id: "karta",
      label: "Kartou online",
      description: cardAvailable
        ? "Platební karta, Apple Pay nebo Google Pay — zabezpečeně přes Stripe."
        : "Platební brána zatím není napojená.",
      available: cardAvailable,
    },
  ];
}

export const paymentMethods: PaymentMethod[] = paymentMethodsFor(false);

export function getShippingMethod(id: string): ShippingMethod | undefined {
  return shippingMethods.find((method) => method.id === id);
}

export function getPaymentMethod(id: string, cardAvailable = false): PaymentMethod | undefined {
  return paymentMethodsFor(cardAvailable).find((method) => method.id === id);
}
