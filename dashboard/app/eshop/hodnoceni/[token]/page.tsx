import type { Metadata } from "next";
import ReviewForm from "@/components/eshop/ReviewForm";
import ShopLink from "@/components/eshop/ShopLink";
import { defaultAuthorName, orderIdFromReviewToken, reviewSecret } from "@/lib/eshop/reviews";
import { loadReviewForm } from "@/lib/eshop/reviewsServer";

// Formulář hodnocení zakoupených produktů (17. 11. 2026). Otevírá se jen
// podepsaným odkazem z e-mailu „Jak vám chutná begina?“ — odkaz je vázaný
// na objednávku, takže hodnotit jde jen to, co zákazník opravdu koupil.
export const metadata: Metadata = { title: "Hodnocení nákupu", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: PageProps<"/eshop/hodnoceni/[token]">) {
  const { token } = await params;
  const secret = reviewSecret();
  const orderId = secret ? orderIdFromReviewToken(decodeURIComponent(token), secret) : null;
  const form = orderId ? await loadReviewForm(orderId) : null;
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Jak vám chutná begina?</h1>
      {!form || form.products.length === 0 ? (
        <div className="mt-4 text-neutral-700">
          <p>Tento odkaz na hodnocení není platný. Použijte prosím odkaz z našeho e-mailu, nebo nám napište na info@begina.cz.</p>
          <ShopLink href="/" className="mt-4 inline-block font-medium underline underline-offset-4">Zpět do e-shopu</ShopLink>
        </div>
      ) : (
        <>
          <p className="mt-2 mb-6 text-neutral-700">Ohodnoťte produkty ze své objednávky: hvězdičky a pár slov ke každému.</p>
          <ReviewForm
            token={decodeURIComponent(token)}
            author={defaultAuthorName(form.customerName)}
            items={form.products.map(({ productId, name, image, existing }) => ({ productId, name, image, existing }))}
          />
        </>
      )}
    </div>
  );
}
