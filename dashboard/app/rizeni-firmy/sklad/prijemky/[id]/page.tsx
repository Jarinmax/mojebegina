import Link from "next/link";
import { notFound } from "next/navigation";
import { getGoodsReceipt, listGoodsReceiptDocumentPages } from "@/lib/data/sklad";
import { getAuthContext } from "@/lib/data/authContext";
import { canUploadGoodsReceiptDocument } from "@/lib/data/skladAuth";
import FotoCapture from "./FotoCapture";
import NacistUdajeButton from "./NacistUdajeButton";

const EXTRACTION_STATUS_LABELS: Record<string, string> = {
  pending: "Vytěžování probíhá…",
  failed: "Předchozí pokus o vytěžení se nezdařil.",
  needs_review: "Vytěžená data čekají na kontrolu.",
};

export default async function PrijemkaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const receipt = await getGoodsReceipt(id);
  if (!receipt) {
    notFound();
  }

  const pages = await listGoodsReceiptDocumentPages(id);
  // Tlačítka pro focení se nezobrazí uživateli bez requireUploadAccess (bod
  // 8 zadání) — samotné API routy to vynucují taky, tohle jen skrývá
  // ovládání, co by stejně skončilo 403.
  const ctx = await getAuthContext();
  const canUpload = canUploadGoodsReceiptDocument(ctx);

  return (
    <div>
      <Link href="/rizeni-firmy/sklad" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Sklad
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">
          Příjemka — {receipt.supplierNameSnapshot}
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {receipt.documentNumber ? `Doklad č. ${receipt.documentNumber} · ` : ""}
          Stav: {receipt.status === "draft" ? "návrh" : receipt.status === "confirmed" ? "potvrzeno" : "stornováno"}
        </p>
      </div>

      <div className="max-w-md flex flex-col gap-4">
        {receipt.status !== "draft" ? (
          <p className="text-sm text-neutral-500">
            Fotky stran dokladu lze přidávat jen k návrhu příjemky.
          </p>
        ) : canUpload ? (
          <FotoCapture receiptId={id} initialPages={pages.map((p) => ({ id: p.id }))} />
        ) : (
          <p className="text-sm text-neutral-500">Nemáte oprávnění nahrávat fotky dokladu.</p>
        )}

        {receipt.status === "draft" && receipt.extractionStatus === "needs_review" && (
          <div className="bg-white border border-neutral-200 rounded-xl p-4">
            <p className="text-sm text-begina-primary-900 mb-2">{EXTRACTION_STATUS_LABELS.needs_review}</p>
            <Link
              href={`/rizeni-firmy/sklad/prijemky/${id}/kontrola`}
              className="block w-full text-center text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5"
            >
              Zkontrolovat vytěžená data
            </Link>
          </div>
        )}

        {receipt.status === "draft" && canUpload && (receipt.extractionStatus === "not_applicable" || receipt.extractionStatus === "failed") && (
          <div className="bg-white border border-neutral-200 rounded-xl p-4">
            {receipt.extractionStatus === "failed" && (
              <p className="text-sm text-begina-accent-700 mb-2">{EXTRACTION_STATUS_LABELS.failed}</p>
            )}
            <NacistUdajeButton receiptId={id} disabled={pages.length === 0} />
          </div>
        )}

        {receipt.status === "draft" && receipt.extractionStatus === "pending" && (
          <div className="bg-white border border-neutral-200 rounded-xl p-4">
            <p className="text-sm text-neutral-500">{EXTRACTION_STATUS_LABELS.pending}</p>
          </div>
        )}
      </div>
    </div>
  );
}
