// Sklad 1.0 (mobilní tok) — vydání podepsaného tokenu pro přímý upload do
// privátního Blob store přes OIDC. Používá `handleUploadPresigned`, ne
// starší `handleUpload`: ta vyžaduje statický BLOB_READ_WRITE_TOKEN (viz
// getReadWriteBlobTokenFromOptionsOrEnv v @vercel/blob — žádný OIDC
// fallback), zatímco issueSignedToken pod handleUploadPresigned OIDC plně
// podporuje (resolveBlobAuth: options.token → OIDC/BLOB_STORE_ID →
// BLOB_READ_WRITE_TOKEN), ověřeno přímo v node_modules/@vercel/blob@2.8.1,
// ne jen z dokumentace. Cestu (pathname) dodává KLIENT — uploadPresigned()
// ji vyžaduje jako vstup dřív, než tuhle route zavolá — proto se tu jen
// ověřuje (authorizeGoodsReceiptUpload), nikdy nevymýšlí.
import { NextResponse, type NextRequest } from "next/server";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { authorizeGoodsReceiptUpload } from "@/lib/data/sklad";
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/data/skladValidation";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

const TOKEN_VALID_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const body = (await request.json()) as HandleUploadPresignedBody;

  try {
    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        const auth = await authorizeGoodsReceiptUpload(receiptId, pathname);
        if (!auth.ok) {
          throw new Error(auth.error);
        }
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + TOKEN_VALID_MS,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
          },
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: "Nepřihlášeno." }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Nemáte oprávnění nahrávat fotky k téhle příjemce." }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Vydání tokenu pro upload selhalo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
