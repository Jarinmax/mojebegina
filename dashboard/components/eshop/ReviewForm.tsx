"use client";

import { useActionState, useState } from "react";
import { submitReviewsAction, type ReviewState } from "@/app/eshop/hodnoceni/[token]/actions";
import { REVIEW_MAX_LENGTH, REVIEW_NAME_MAX_LENGTH, REVIEW_VERIFICATION_NOTICE } from "@/lib/eshop/reviewsFormat";
import Stars from "./Stars";

export type ReviewFormItem = { productId: string; name: string; image: string | null; existing: { rating: number; body: string } | null };

const STAR = "M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z";
const WORDS = ["", "Nechutnalo", "Nic moc", "Dobré", "Velmi dobré", "Výborné"];

function StarInput({ name, label }: { name: string; label: string }) {
  const [value, setValue] = useState(0);
  return (
    <fieldset>
      <legend className="sr-only">Počet hvězdiček – {label}</legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <label key={star} className="cursor-pointer p-1 -m-0.5">
            <input type="radio" name={name} value={star} checked={value === star} onChange={() => setValue(star)} className="sr-only peer" />
            <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`peer-focus-visible:outline peer-focus-visible:outline-2 rounded ${star <= value ? "text-[#C8881A]" : "text-[#D9D4C7]"}`}>
              <path d={STAR} />
            </svg>
            <span className="sr-only">{star} z 5</span>
          </label>
        ))}
        <span className="ml-2 text-sm text-neutral-600" aria-live="polite">{WORDS[value]}</span>
      </div>
    </fieldset>
  );
}

export default function ReviewForm({ token, author, items }: { token: string; author: string; items: ReviewFormItem[] }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(submitReviewsAction, { status: "idle" });
  if (state.status === "done") {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-[#FAF6EF] p-5">
        <p className="font-medium">Děkujeme za hodnocení.</p>
        <p className="mt-1 text-neutral-700">Najdete ho na stránce produktu se štítkem „Ověřený nákup“.</p>
      </div>
    );
  }
  const open = items.filter((item) => !item.existing);
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="token" value={token} />
      <input type="text" name="web" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <ul className="flex flex-col gap-5">
        {items.map((item) => (
          <li key={item.productId} className="rounded-2xl border border-neutral-200 p-4">
            <div className="flex items-center gap-3">
              {item.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt="" width={56} height={56} className="h-14 w-14 rounded-lg object-cover" />
              )}
              <h2 className="font-medium">{item.name}</h2>
            </div>
            {item.existing ? (
              <div className="mt-3 text-neutral-700">
                <p className="flex items-center gap-2"><Stars value={item.existing.rating} size={20} /> <span className="text-sm text-neutral-500">Už jste hodnotili, děkujeme.</span></p>
                {item.existing.body && <p className="mt-2 whitespace-pre-line">{item.existing.body}</p>}
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <StarInput name={`rating-${item.productId}`} label={item.name} />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-neutral-600">Jak vám chutnalo? (nepovinné)</span>
                  <textarea name={`body-${item.productId}`} rows={3} maxLength={REVIEW_MAX_LENGTH} className="rounded-lg border border-neutral-300 p-2.5 text-base" />
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>
      {open.length > 0 && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-600">Jméno, které se u hodnocení zobrazí</span>
            <input type="text" name="author" defaultValue={author} maxLength={REVIEW_NAME_MAX_LENGTH} className="rounded-lg border border-neutral-300 p-2.5 text-base" />
          </label>
          {state.status === "error" && <p role="alert" className="rounded-lg bg-[#FCE2E1] px-3 py-2 text-[#B40001]">{state.error}</p>}
          <button type="submit" disabled={pending} className="bg-begina-primary-900 hover:bg-begina-primary-800 text-white font-medium rounded-lg px-4 h-11 disabled:opacity-60">
            {pending ? "Odesílám…" : "Odeslat hodnocení"}
          </button>
          <p className="text-sm text-neutral-500">
            Hodnocení zveřejníme na stránce produktu pod tímto jménem, bez příjmení. {REVIEW_VERIFICATION_NOTICE} Nemusíte hodnotit všechny produkty.
          </p>
        </>
      )}
    </form>
  );
}
