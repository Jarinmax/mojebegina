import Link from "next/link";
import { notFound } from "next/navigation";
import { getGoodsReceipt, listGoodsReceiptDocumentPages } from "@/lib/data/sklad";
import { getAuthContext } from "@/lib/data/authContext";
import { canUploadGoodsReceiptDocument } from "@/lib/data/skladAuth";
import FotoCapture from "./FotoCapture";

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

      <div className="max-w-md">
        {receipt.status !== "draft" ? (
          <p className="text-sm text-neutral-500">
            Fotky stran dokladu lze přidávat jen k návrhu příjemky.
          </p>
        ) : canUpload ? (
          <FotoCapture receiptId={id} initialPages={pages.map((p) => ({ id: p.id }))} />
        ) : (
          <p className="text-sm text-neutral-500">Nemáte oprávnění nahrávat fotky dokladu.</p>
        )}
      </div>
    </div>
  );
}
