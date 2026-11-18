import Link from "next/link";
import type { OrderCounts } from "@/lib/data/orders";

// Security Phase 15 (Objednávky 1.0) — executive přehled, použitý jak na
// /rizeni-firmy (souhrn s prokliky), tak nahoře na /rizeni-firmy/objednavky.
// "Čeká na platbu" záměrně nezávisí na fulfillment stavu — i doručená,
// nezaplacená objednávka tu má zůstat (schváleno explicitně).
const TILES: { key: keyof OrderCounts; label: string; filter: string }[] = [
  { key: "new", label: "Nové", filter: "new" },
  { key: "inProcess", label: "V procesu", filter: "in_process" },
  { key: "readyForDelivery", label: "K doručení", filter: "ready_for_delivery" },
  { key: "awaitingPayment", label: "Čeká na platbu", filter: "awaiting_payment" },
];

export default function OrderSummaryTiles({ counts }: { counts: OrderCounts }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {TILES.map((tile) => (
        <Link
          key={tile.key}
          href={`/rizeni-firmy/objednavky?filter=${tile.filter}`}
          className="bg-white border border-neutral-200 rounded-xl p-3 hover:border-begina-primary-300 transition-colors"
        >
          <p className="text-xl font-medium text-begina-primary-900">{counts[tile.key]}</p>
          <p className="text-xs text-neutral-500">{tile.label}</p>
        </Link>
      ))}
    </div>
  );
}
