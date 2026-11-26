import { formatKc, PAYMENT_LABELS, receiptNumber, type PosPaymentMethod } from "@/lib/pokladna/pos";

// Účtenka bistra (vzhled pro displej i tisk). Údaje podle § 16 zákona
// o ochraně spotřebitele: kdo prodává, kdy, co a za kolik.
const SELLER = {
  name: "Jaroslav Viner",
  ico: "74337297",
  premises: "Zahradní Bistro Begina, Vitice 119, 281 06 Vitice",
};

export type ReceiptViewData = {
  year: number;
  seq: number;
  createdAt: Date;
  paymentMethod: PosPaymentMethod;
  totalHal: number;
  cashGivenHal: number | null;
  note: string | null;
  cashierName: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  lines: Array<{ name: string; quantity: number; lineTotalHal: number }>;
};

export default function ReceiptView({ receipt: r }: { receipt: ReceiptViewData }) {
  const time = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", dateStyle: "short", timeStyle: "short" }).format(r.createdAt);
  return (
    <article className="bg-white border border-neutral-200 rounded-xl p-4 font-mono text-sm">
        {r.cancelledAt && <p className="mb-2 text-center font-bold text-red-700">STORNOVÁNO — {r.cancelReason}</p>}
        <p className="text-center font-bold">ZAHRADNÍ BISTRO BEGINA</p>
        <p className="text-center text-xs">{SELLER.premises}</p>
        <p className="text-center text-xs mb-2">
          {SELLER.name}, IČO {SELLER.ico} · Nejsem plátce DPH
        </p>
        <p className="text-xs">Účtenka č. {receiptNumber(r.year, r.seq)}</p>
        <p className="text-xs mb-2">{time} · pokladna 1{r.cashierName ? ` · ${r.cashierName}` : ""}</p>
        <table className="w-full text-xs">
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={i}>
                <td className="py-0.5">{l.quantity}× {l.name}</td>
                <td className="py-0.5 text-right whitespace-nowrap">{formatKc(l.lineTotalHal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="flex justify-between border-t border-dashed border-neutral-400 mt-2 pt-2 font-bold">
          <span>CELKEM</span>
          <span>{formatKc(r.totalHal)}</span>
        </p>
        <p className="text-xs">Placeno: {PAYMENT_LABELS[r.paymentMethod]}</p>
        {r.paymentMethod === "cash" && r.cashGivenHal !== null && (
          <p className="text-xs">
            Přijato {formatKc(r.cashGivenHal)} · vráceno {formatKc(r.cashGivenHal - r.totalHal)}
          </p>
        )}
        {r.note && <p className="text-xs mt-1">{r.note}</p>}
        <p className="text-center text-xs mt-3">Děkujeme · begina.cz</p>
    </article>
  );
}
