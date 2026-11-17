import { BadgeCheck } from "lucide-react";
import { REVIEW_VERIFICATION_NOTICE, VERIFIED_LABEL, countLabel, formatAverage, type ReviewSummary } from "@/lib/eshop/reviewsFormat";
import type { PublicReview } from "@/lib/eshop/reviewsServer";
import Stars from "./Stars";

// Hodnocení na detailu produktu (17. 11. 2026): průměr, počet, všechny
// recenze (nic se neskrývá) a věta o ověřování podle zákona o ochraně
// spotřebitele. Dokud produkt nikdo nehodnotil, sekce se nezobrazuje.
export default function ProductReviews({ summary, reviews }: { summary: ReviewSummary | null; reviews: PublicReview[] }) {
  if (!summary || reviews.length === 0) return null;
  return (
    <section id="hodnoceni" className="mt-8 border-t border-neutral-200 pt-6" aria-labelledby="hodnoceni-nadpis">
      <h2 id="hodnoceni-nadpis" className="font-medium mb-3">Hodnocení zákazníků</h2>
      <p className="flex items-center gap-2 tabular-nums">
        <Stars value={summary.average} size={20} label={`Průměr ${formatAverage(summary.average)} z 5`} />
        <span className="font-semibold">{formatAverage(summary.average)}</span>
        <span className="text-neutral-500">· {countLabel(summary.count)}</span>
      </p>
      <p className="mt-2 text-sm text-neutral-500">{REVIEW_VERIFICATION_NOTICE}</p>
      <ul className="mt-4 flex flex-col divide-y divide-neutral-100">
          {reviews.map((review) => (
            <li key={review.id} className="py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars value={review.rating} />
                <span className="font-medium">{review.authorName}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#F1EFE3] px-2 py-0.5 text-xs font-medium text-[#4A5527]">
                  <BadgeCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  {VERIFIED_LABEL}
                </span>
                <span className="text-sm text-neutral-500">{review.createdAt}</span>
              </div>
              {review.body && <p className="mt-2 text-neutral-700 whitespace-pre-line break-words">{review.body}</p>}
            </li>
          ))}
      </ul>
    </section>
  );
}
