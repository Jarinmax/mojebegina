// Sklad 1.0 (mobilní tok) — finalizace stránky dokladu PO úspěšném uploadu
// do Blobu (handleUploadPresigned/uploadPresigned v upload-token route výš
// jen vydává podepsaný token, nic nezapisuje do DB). Samostatný krok, žádný
// onUploadCompleted webhook — ten by potřeboval veřejně dostupnou URL a pro
// lokální vývoj zbytečnou infrastrukturu navíc; klient volá tuhle route
// přímo po doběhnutí uploadPresigned(). Veškerá autorizace, draft-only
// kontrola, idempotence a úklid osiřelého Blobu žije v
// registerGoodsReceiptDocumentPage (lib/data/sklad.ts).
import { NextResponse, type NextRequest } from "next/server";
import { registerGoodsReceiptDocumentPage } from "@/lib/data/sklad";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;

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
    const result = await registerGoodsReceiptDocumentPage(receiptId, { pathname, sha256, mimeType });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ pageId: result.pageId });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Nepřihlášeno." }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Nemáte oprávnění nahrávat fotky k téhle příjemce." }, { status: 403 });
    }
    throw error;
  }
}
