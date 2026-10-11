// PDF balíček aktuální verze: obchodní podmínky + poučení o odstoupení +
// vzorový formulář (lib/eshop/legal/versions.ts — stejný soubor, jaký
// dostává zákazník k objednávce). Na begina.cz /obchodni-podminky.pdf,
// na moje.begina.cz /eshop/obchodni-podminky.pdf.
import { CURRENT_LEGAL_VERSION, legalPdf } from "@/lib/eshop/legal/versions";
import { isEshopPublic } from "@/lib/eshop/storeMode";

export async function GET() {
  if (!isEshopPublic()) return new Response("Not Found", { status: 404 });
  const pdf = await legalPdf(CURRENT_LEGAL_VERSION);
  return new Response(Buffer.from(pdf.contentBase64, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.filename}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
