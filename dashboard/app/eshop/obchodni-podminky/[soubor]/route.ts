// PDF obchodních podmínek ke stažení: /obchodni-podminky/<id znění>.pdf
// (na moje.begina.cz /eshop/obchodni-podminky/…). Každé znění má trvalou
// adresu — i starší znění, se kterým souhlasil zákazník dřívější objednávky.
import { findTermsVersion } from "@/lib/eshop/content/termsVersions";
import { termsPdf } from "@/lib/eshop/legal/termsPdf";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/eshop/obchodni-podminky/[soubor]">) {
  const { soubor } = await ctx.params;
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
