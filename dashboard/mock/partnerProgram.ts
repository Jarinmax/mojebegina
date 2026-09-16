// Partnerský program (objemové slevy) — obsah úrovní, podmínek, dopravy
// a právní poznámky je PŘEVZATÝ ze skutečné stránky begina.cz/partnersky-program
// (screenshot dodaný 14. 9. 2026), NENÍ to vymyšlený placeholder.
//
// Tento soubor obsahuje jen PRAVIDLA programu (úrovně, podmínky). Kolik
// konkrétní zákazník za aktuální měsíc nakoupil je zákaznický údaj, ne
// pravidlo programu — ten se počítá v mock/customer.ts
// (currentMonthlyPurchase) ze skutečných uhrazených objednávek daného
// kalendářního měsíce.

export type PartnerTier = {
  id: number;
  rangeLabel: string;
  discountLabel: string;
  minAmount: number;
  maxAmount: number | null;
  discountPercent: number | null;
};

export const partnerTiers: PartnerTier[] = [
  { id: 1, rangeLabel: "do 5 000 Kč", discountLabel: "standardní cena", minAmount: 0, maxAmount: 5000, discountPercent: 0 },
  { id: 2, rangeLabel: "5 001–8 000 Kč", discountLabel: "sleva 3 %", minAmount: 5001, maxAmount: 8000, discountPercent: 3 },
  { id: 3, rangeLabel: "8 001–12 000 Kč", discountLabel: "sleva 5 %", minAmount: 8001, maxAmount: 12000, discountPercent: 5 },
  { id: 4, rangeLabel: "12 001–20 000 Kč", discountLabel: "sleva 7 %", minAmount: 12001, maxAmount: 20000, discountPercent: 7 },
  { id: 5, rangeLabel: "nad 20 000 Kč", discountLabel: "individuální dohoda", minAmount: 20001, maxAmount: null, discountPercent: null },
];

export const partnerProgramConditions = [
  "Vyhodnocení: součet všech objednávek za kalendářní měsíc.",
  "Započítává se pouze hodnota zboží bez ceny dopravy a dalších poplatků.",
  "Sleva platí pro všechny objednávky v následujícím měsíci.",
  "Do vyhodnocení se započítávají pouze uhrazené objednávky.",
];

export const partnerProgramShipping =
  "Chlazená doprava dle aktuálního ceníku e-shopu.";

export const partnerProgramLegalNote =
  "Nejsme plátci DPH. Uvedené ceny jsou konečné.";
