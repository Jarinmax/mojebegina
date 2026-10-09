import Link from "next/link";
import { notFound } from "next/navigation";
import { getGoodsReceipt, listGoodsReceiptLines, listStockItems } from "@/lib/data/sklad";
import { getGoodsReceiptExtractionSuggestions } from "@/lib/data/skladExtraction";
import KontrolaForm from "./KontrolaForm";

export default async function KontrolaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const receipt = await getGoodsReceipt(id);
  if (!receipt) {
    notFound();
  }

  const [lines, suggestions, stockItems] = await Promise.all([
    listGoodsReceiptLines(id),
    getGoodsReceiptExtractionSuggestions(id),
    listStockItems(),
  ]);

  return (
    <div>
      <Link href={`/rizeni-firmy/sklad/prijemky/${id}`} className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Příjemka
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Kontrola vytěžených dat — {receipt.supplierNameSnapshot}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Opravte hodnoty, potvrďte DPH a mapování na skladovou kartu u každého řádku. Vytěžil to model, ne člověk — nic se
          nepotvrdí ani neovlivní sklad, dokud to tady nezkontrolujete.
        </p>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-neutral-500">Žádné řádky k revizi.</p>
      ) : (
        <KontrolaForm receiptId={id} lines={lines} suggestions={suggestions} stockItems={stockItems} />
      )}
    </div>
  );
}
