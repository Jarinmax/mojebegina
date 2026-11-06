// PDF obchodních podmínek ke stažení: /obchodni-podminky/<id znění>.pdf
// (na moje.begina.cz /eshop/obchodni-podminky/…). Každé znění má trvalou
// adresu — i starší znění, se kterým souhlasil zákazník dřívější objednávky.
import { CURRENT_TERMS, findTermsVersion } from "@/lib/eshop/content/termsVersions";
import { WITHDRAWAL_FORM_PDF_PATH } from "@/lib/eshop/content/withdrawalForm";
import { termsPdf, withdrawalFormPdf } from "@/lib/eshop/legal/termsPdf";

/** Název souboru formuláře pro odstoupení (/obchodni-podminky/<tento název>). */
const FORM_FILE = WITHDRAWAL_FORM_PDF_PATH.slice(WITHDRAWAL_FORM_PDF_PATH.lastIndexOf("/") + 1);

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/eshop/obchodni-podminky/[soubor]">) {
  const { soubor } = await ctx.params;
  // Formulář pro odstoupení k platnému znění (adresa je stálá, obsah se mění
  // jen s novým zněním → krátká mezipaměť).
  if (soubor === FORM_FILE) {
    const form = await withdrawalFormPdf(CURRENT_TERMS);
    return new Response(Buffer.from(form.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${form.filename}"`,
        "Cache-Control": "public, max-age=3600",
        "X-Content-SHA256": form.sha256,
      },
    });
  }
  const version = soubor.endsWith(".pdf") ? findTermsVersion(soubor.slice(0, -".pdf".length)) : null;
  if (!version) return new Response("Nenalezeno", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const pdf = await termsPdf(version);
  return new Response(Buffer.from(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.filename}"`,
      // znění se nikdy nemění — smí se uložit natrvalo
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-SHA256": pdf.sha256,
    },
  });
}
