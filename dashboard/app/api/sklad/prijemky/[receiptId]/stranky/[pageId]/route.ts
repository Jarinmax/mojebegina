// Sklad 1.0 (mobilní tok) — jediná cesta, kterou lze náhled/originál strany
// dokladu vůbec uvidět (bod 9 zadání: originál se nikdy nezpřístupní přímo,
// ani jako veřejná Blob URL). getGoodsReceiptDocumentPageForDownload sama
// vyžaduje requirePricesAndOriginalAccess a ověří, že stránka patří téhle
// příjemce — tahle route pak soubor streamuje server-side přes Blob `get()`
// (private access, čte přes OIDC), klient nikdy nevidí storage_key ani
// žádnou Blob URL.
import { NextResponse, type NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { getGoodsReceiptDocumentPageForDownload, replaceGoodsReceiptDocumentPage } from "@/lib/data/sklad";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

// "Nahrát lepší fotografii" — finalizace PO úspěšném uploadu NOVÉ fotky do
// Blobu (stejný dvoukrokový vzor jako POST .../stranky: upload-token vydá
// podepsaný token, tahle route teprve NAHRADÍ existující stranu). Veškerá
// autorizace, draft-only/extraction-status kontrola, ověření sha256 a
// úklid starého i osiřelého Blobu žije v replaceGoodsReceiptDocumentPage
// (lib/data/sklad.ts).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ receiptId: string; pageId: string }> }) {
  const { receiptId, pageId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }
  const { pathname, sha256, mimeType } = body as Record<string, unknown>;
  if (typeof pathname !== "string" || typeof sha256 !== "string" || typeof mimeType !== "string") {
    return NextResponse.json({ error: "Chybí pathname, sha256 nebo mimeType." }, { status: 400 });
  }

  try {
    const result = await replaceGoodsReceiptDocumentPage(receiptId, pageId, { pathname, sha256, mimeType });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ pageId: result.pageId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Nepřihlášeno." }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Nemáte oprávnění nahrazovat fotky u téhle příjemky." }, { status: 403 });
    }
    throw error;
  }
}

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
