// Etiketa k tisku se šarží (Lucie 21. 11. 2026, krok 2): PDF z etikety
// složení s dopsaným číslem šarže a datem spotřeby, tolik stran, kolik kusů.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { productCategories, productionBatches, productionBatchLines, products } from "@/lib/db/schema";
import { requireOrderContext } from "@/lib/data/orders";
import { buildBatchLabelPdf, resolveLabelFile } from "@/lib/vyroba/batchLabel";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ lineId: string }> }) {
  await requireOrderContext();
  const { lineId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(lineId)) return new Response("Neplatný odkaz.", { status: 400 });
  const [row] = await db
    .select({
      code: productionBatches.code,
      quantity: productionBatchLines.quantity,
      volumeMl: productionBatchLines.volumeMl,
      bestBefore: productionBatchLines.bestBefore,
      productSlug: products.slug,
      productName: products.name,
      categorySlug: productCategories.slug,
    })
    .from(productionBatchLines)
    .innerJoin(productionBatches, eq(productionBatches.id, productionBatchLines.batchId))
    .innerJoin(products, eq(products.id, productionBatches.productId))
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(eq(productionBatchLines.id, lineId))
    .limit(1);
  if (!row) return new Response("Šarže nebyla nalezena.", { status: 404 });
  const file = resolveLabelFile(row.categorySlug, row.productSlug, row.productName, row.volumeMl);
  if (!file) return new Response("Pro toto balení zatím není etiketa složení v MojeBegina → Etikety.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const url = new URL(request.url);
  const copiesParam = Number(url.searchParams.get("ks"));
  const copies = Number.isFinite(copiesParam) && copiesParam > 0 ? copiesParam : row.quantity;
  const png = await fetch(new URL(`/etikety/${file.split("/").map(encodeURIComponent).join("/")}`, url.origin), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });
  if (!png.ok) return new Response("Etiketu se nepodařilo načíst.", { status: 502 });
  const pdf = await buildBatchLabelPdf(new Uint8Array(await png.arrayBuffer()), row.code, row.bestBefore, copies);
  if (!pdf) return new Response("Na etiketě se nepodařilo najít řádek „Šarže:“.", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="etiketa-${row.code}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
