"use server";

import { cleanAuthorName, defaultAuthorName, orderIdFromReviewToken, parseReview, reviewSecret, type ReviewInput } from "@/lib/eshop/reviews";
import { loadReviewForm, saveReviews } from "@/lib/eshop/reviewsServer";
import { isEshopPublic } from "@/lib/eshop/storeMode";

export type ReviewState = { status: "idle" } | { status: "error"; error: string } | { status: "done"; saved: number };

export async function submitReviewsAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  if (!isEshopPublic()) return { status: "error", error: "E-shop je teď nedostupný." };
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  // past na roboty: skryté pole člověk nevyplní
  if (field("web")) return { status: "done", saved: 0 };
  const secret = reviewSecret();
  const orderId = secret ? orderIdFromReviewToken(field("token"), secret) : null;
  const form = orderId ? await loadReviewForm(orderId) : null;
  if (!form) return { status: "error", error: "Odkaz na hodnocení není platný. Použijte prosím odkaz z našeho e-mailu." };

  const inputs: ReviewInput[] = [];
  for (const product of form.products) {
    if (product.existing) continue;
    const parsed = parseReview(product.productId, field(`rating-${product.productId}`), field(`body-${product.productId}`));
    if (parsed === null) continue;
    if ("error" in parsed) return { status: "error", error: `${product.name}: ${parsed.error}` };
    inputs.push(parsed);
  }
  if (inputs.length === 0) return { status: "error", error: "Vyberte hvězdičky aspoň u jednoho produktu." };
  const author = cleanAuthorName(field("author"), defaultAuthorName(form.customerName));
  const saved = await saveReviews(form, author, inputs);
  return { status: "done", saved };
}
