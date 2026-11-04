import Link from "next/link";
import { notFound } from "next/navigation";
import { getGoodsReceipt, listGoodsReceiptLines } from "@/lib/data/sklad";
import { getGoodsReceiptReextractionPreview } from "@/lib/data/skladExtraction";
import PorovnaniForm from "./PorovnaniForm";

export default async function ZnovuPrecistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const receipt = await getGoodsReceipt(id);
  if (!receipt) {
    notFound();
  }

  const backLink = (
    <Link href={`/rizeni-firmy/sklad/prijemky/${id}`} className="text-sm text-neutral-500 hover:text-begina-primary-900">
      ← Příjemka
    </Link>
  );

  if (receipt.status !== "draft") {
    return (
      <div>
        {backLink}
        <p className="text-sm text-neutral-500 mt-3">Potvrzené a stornované příjemky appka nemění — porovnání tu není k dispozici.</p>
      </div>
    );
  }

  const preview = await getGoodsReceiptReextractionPreview(id);
  if (!preview || preview.status !== "ready" || !preview.raw) {
    return (
      <div>
        {backLink}
        <p className="text-sm text-neutral-500 mt-3">Žádný výsledek nového čtení nečeká na porovnání.</p>
      </div>
    );
  }

  const originalLines = await listGoodsReceiptLines(id);

  return (
    <div>
      {backLink}
      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Porovnání nového čtení — {receipt.supplierNameSnapshot}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Původní řádky zůstávají beze změny, dokud nový výsledek výslovně nepřevezmete. Převzetí nahradí VŠECHNY původní
          řádky těmi novými.
        </p>
      </div>

      <PorovnaniForm receiptId={id} originalLines={originalLines} raw={preview.raw} />
    </div>
  );
}
