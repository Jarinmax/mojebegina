// ESHOP 1.0 — QR kód pro QR Platbu (text = SPAYD z bankTransfer.ts).
//   - PNG pro e-mail (vložený obrázek přes Content-ID, viz email/orderEmails.ts —
//     funguje i v klientech, které blokují externí obrázky nebo data: URL),
//   - SVG pro stránku objednávky.
// Úroveň opravy chyb M + okraj 4 moduly = doporučení standardu QR Platba.
import QRCode from "qrcode";

const OPTIONS = { errorCorrectionLevel: "M" as const, margin: 4 };

export async function qrPng(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { ...OPTIONS, type: "png", width: 360 });
}

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...OPTIONS, type: "svg" });
}
