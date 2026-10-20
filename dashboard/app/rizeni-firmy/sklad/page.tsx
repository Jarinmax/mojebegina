import Link from "next/link";
import { listGoodsReceipts } from "@/lib/data/sklad";

const STATUS_LABELS: Record<string, string> = {
  draft: "návrh",
  confirmed: "potvrzeno",
  voided: "stornováno",
};

export default async function SkladPage() {
  const receipts = await listGoodsReceipts();

  return (
    <div>
      <Link href="/rizeni-firmy" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Řízení firmy
      </Link>

      <div className="mt-3 mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-begina-primary-900">Sklad — příjemky</h1>
          <p className="text-sm text-neutral-500 mt-0.5">Mobilní tok 1.0 — založení příjemky a vyfocení dokladu.</p>
        </div>
        <Link
          href="/rizeni-firmy/sklad/nova-prijemka"
          className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 whitespace-nowrap"
        >
          + Nová příjemka
        </Link>
      </div>

      {receipts.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
          Zatím žádná příjemka.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {receipts.map((receipt) => (
            <Link
              key={receipt.id}
              href={`/rizeni-firmy/sklad/prijemky/${receipt.id}`}
              className="bg-white border border-neutral-200 rounded-xl p-4 flex items-center justify-between hover:border-begina-primary-300"
            >
              <div>
                <p className="text-sm font-medium text-begina-primary-900">{receipt.supplierNameSnapshot}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {receipt.documentNumber ? `Doklad č. ${receipt.documentNumber} · ` : ""}
                  {STATUS_LABELS[receipt.status] ?? receipt.status}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
