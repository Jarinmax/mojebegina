// DOKLADY — příjem souboru dokladu od asistenta přes jednorázový odkaz
// (viz lib/doklady/uploadLink.ts a nástroj economy_document_upload_link).
//
//   curl -sS -X POST --data-binary @faktura.pdf -H "Content-Type: application/pdf" "<upload_url>"
//
// Žádná session ani hlavička Authorization: oprávnění se ověřilo při vydání
// odkazu (Jaroslav/Lucie, souhlas mojebegina.invoicing) a odkaz je
// podepsaný, 15 minut platný a vázaný na řádek, typ, velikost a SHA-256
// souboru. Tady se znovu ověří podpis, platnost, že vydavatel je pořád
// vystavovatel faktur, a že tělo je přesně ten soubor.
import { attachDocumentBytesAs, DOC_MAX_BYTES } from "@/lib/doklady/documents";
import { checkUploadedBytes, uploadLinkSecret, verifyUploadLink } from "@/lib/doklady/uploadLink";
import { INVOICE_ISSUERS } from "@/lib/data/invoiceAuth";
import { jsonNoStore } from "@/lib/agent/http";

export const maxDuration = 60;

// Vercel pustí do funkce tělo nejvýš ~4,5 MB; faktury z e-mailu bývají
// v desítkách až stovkách kB. Větší soubor → nahrát ručně v Dokladech.
const MAX_BODY_BYTES = Math.min(DOC_MAX_BYTES, 4 * 1024 * 1024);

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token) return jsonNoStore({ ok: false, error: "Chybí token odkazu." }, 400);

  let secret: string;
  try {
    secret = uploadLinkSecret();
  } catch {
    return jsonNoStore({ ok: false, error: "Nahrávání dokladů asistentem není na serveru nastavené." }, 503);
  }

  const verified = verifyUploadLink(token, secret);
  if (!verified.ok) return jsonNoStore({ ok: false, error: verified.error }, 401);
  const claims = verified.claims;
  if (INVOICE_ISSUERS.get(claims.userId) !== claims.systemRole) {
    return jsonNoStore({ ok: false, error: "Doklady smí nahrávat jen Jaroslav a Lucie." }, 403);
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return jsonNoStore({ ok: false, error: "Soubor je větší než 4 MB — nahrajte ho ručně v Řízení firmy → Doklady." }, 413);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) {
    return jsonNoStore({ ok: false, error: "Soubor je větší než 4 MB — nahrajte ho ručně v Řízení firmy → Doklady." }, 413);
  }
  const check = checkUploadedBytes(claims, bytes);
  if (!check.ok) return jsonNoStore({ ok: false, error: check.error }, 400);

  const result = await attachDocumentBytesAs(
    { userId: claims.userId, name: claims.uploaderName },
    { entryId: claims.entryId, filename: claims.filename, mimeType: claims.mimeType, bytes }
  );
  if (!result.ok) return jsonNoStore({ ok: false, error: result.error }, 400);
  return jsonNoStore({
    ok: true,
    attached: !result.duplicate,
    duplicate: result.duplicate === true,
    documentId: result.id,
    entryId: claims.entryId,
    filename: claims.filename,
    url: "https://moje.begina.cz/rizeni-firmy/doklady",
  });
}
