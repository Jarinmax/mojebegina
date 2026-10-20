import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { getGoodsReceipt, getGoodsReceiptConfirmationCheck, listGoodsReceiptLines, listStockItems } from "@/lib/data/sklad";
import { canConfirmGoodsReceipt, canReviewExtractedData } from "@/lib/data/skladAuth";
import { getGoodsReceiptExtractionSuggestions } from "@/lib/data/skladExtraction";
import HlavickaForm from "./HlavickaForm";
import KontrolaForm from "./KontrolaForm";
import PotvrzeniPanel from "./PotvrzeniPanel";

export default async function KontrolaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const receipt = await getGoodsReceipt(id);
  if (!receipt) {
    notFound();
  }

  const ctx = await getAuthContext();
  const canReview = canReviewExtractedData(ctx);
  const [lines, suggestions, stockItems, checks] = await Promise.all([
    listGoodsReceiptLines(id),
    canReview ? getGoodsReceiptExtractionSuggestions(id) : Promise.resolve([]),
    listStockItems(),
    getGoodsReceiptConfirmationCheck(id),
  ]);

  return (
    <div>
      <Link href={`/rizeni-firmy/sklad/prijemky/${id}`} className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Příjemka
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Kontrola a potvrzení — {receipt.supplierNameSnapshot}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Vytěžené údaje jsou jen návrh. Opravte hodnoty, potvrďte DPH a skladovou kartu u každého řádku — do skladu se nic
          nezapíše, dokud příjemku níže výslovně nepotvrdíte.
        </p>
      </div>

      {receipt.status !== "draft" ? (
        <p className="text-sm text-neutral-500">Příjemka už není návrh — kontrola ani potvrzení nejsou možné.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {canReview && (
            <HlavickaForm
              receiptId={id}
              documentNumber={receipt.documentNumber}
              documentDate={receipt.documentDate}
              documentTotalWithVatHal={receipt.documentTotalWithVatHal}
            />
          )}
          {lines.length === 0 ? (
            <p className="text-sm text-neutral-500">Žádné řádky k revizi.</p>
          ) : (
            <KontrolaForm receiptId={id} lines={lines} suggestions={suggestions} stockItems={stockItems} />
          )}
          {checks && <PotvrzeniPanel receiptId={id} checks={checks} canConfirm={canConfirmGoodsReceipt(ctx)} />}
        </div>
      )}
    </div>
  );
}
