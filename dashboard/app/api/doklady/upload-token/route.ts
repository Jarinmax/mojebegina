// Doklady (Lucie 19. 11. 2026) — podepsaný token pro přímý upload dokladu
// nákladu do privátního Blobu (stejný postup jako fotky příjemek, viz
// app/api/sklad/prijemky/[receiptId]/upload-token). Cestu dodává klient,
// tady se jen ověří (doklady/RRRR-MM/<uuid>.<přípona>).
import { NextResponse, type NextRequest } from "next/server";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { DOC_MAX_BYTES, DOC_MIME_TYPES, DocumentAccessError, isValidDocumentPathname, requireDocumentAccess } from "@/lib/doklady/documents";

const TOKEN_VALID_MS = 5 * 60 * 1000;
class PathError extends Error {}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadPresignedBody;
  try {
    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        await requireDocumentAccess();
        if (!isValidDocumentPathname(pathname)) throw new PathError("Neplatná cesta nahrávaného souboru.");
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: [...DOC_MIME_TYPES],
          maximumSizeInBytes: DOC_MAX_BYTES,
          validUntil: Date.now() + TOKEN_VALID_MS,
        });
        return { token, urlOptions: { allowedContentTypes: [...DOC_MIME_TYPES], maximumSizeInBytes: DOC_MAX_BYTES } };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentAccessError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof PathError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Vydání tokenu pro upload selhalo. Zkuste to znovu." }, { status: 400 });
  }
}
