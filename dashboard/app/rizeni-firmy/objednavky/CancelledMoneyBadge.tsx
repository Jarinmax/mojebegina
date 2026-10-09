import type { MoneyAlert } from "@/lib/eshop/cancellation";

// Štítek stornované objednávky, za kterou Begina drží peníze (výpis i detail).
export default function CancelledMoneyBadge({ money }: { money: MoneyAlert | null }) {
  if (!money) return null;
  if (money.stage === "overpaid") {
    return <span className="text-xs px-2 py-0.5 rounded-full border bg-red-50 text-red-800 border-red-200">Přeplatek k vrácení</span>;
  }
  return money.stage === "refund" ? (
    <span className="text-xs px-2 py-0.5 rounded-full border bg-red-50 text-red-800 border-red-200">Vrátit peníze</span>
  ) : (
    <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200">
      Platba po stornu – kontaktovat zákazníka
    </span>
  );
}
