// Sklad 1.0 (mobilní tok) — jediná cesta, kterou lze náhled/originál strany
// dokladu vůbec uvidět (bod 9 zadání: originál se nikdy nezpřístupní přímo,
// ani jako veřejná Blob URL). getGoodsReceiptDocumentPageForDownload sama
// vyžaduje requirePricesAndOriginalAccess a ověří, že stránka patří téhle
// příjemce — tahle route pak soubor streamuje server-side přes Blob `get()`
// (private access, čte přes OIDC), klient nikdy nevidí storage_key ani
// žádnou Blob URL.
import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getGoodsReceiptDocumentPageForDownload } from "@/lib/data/sklad";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ receiptId: string; pageId: string }> }
) {
  const { receiptId, pageId } = await params;

  try {
    const page = await getGoodsReceiptDocumentPageForDownload(receiptId, pageId);
    if (!page.ok) {
      return NextResponse.json({ error: page.error }, { status: 404 });
    }

    const blob = await get(page.pathname, { access: "private" });
    if (!blob || blob.statusCode !== 200) {
      return NextResponse.json({ error: "Soubor nebyl v úložišti nalezen." }, { status: 404 });
    }

    return new NextResponse(blob.stream, {
      headers: {
        "content-type": blob.blob.contentType || page.mimeType,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Nepřihlášeno." }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Nemáte oprávnění zobrazit originál dokladu." }, { status: 403 });
    }
    throw error;
  }
}
