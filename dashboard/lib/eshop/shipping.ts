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
    label: "Osobní odběr",
    description: "Vyzvednutí po domluvě, místo a čas upřesníme e-mailem.",
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

export const paymentMethods: PaymentMethod[] = [
  {
    id: "prevod",
    label: "Bankovní převod",
    description: "Po objednávce pošleme platební údaje a QR kód.",
    available: true,
  },
  {
    id: "karta",
    label: "Kartou online",
    description: "Platební brána zatím není napojená.",
    available: false,
  },
];

export function getShippingMethod(id: string): ShippingMethod | undefined {
  return shippingMethods.find((method) => method.id === id);
}

export function getPaymentMethod(id: string): PaymentMethod | undefined {
  return paymentMethods.find((method) => method.id === id);
}
