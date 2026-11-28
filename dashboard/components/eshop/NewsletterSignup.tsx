"use client";

import { useActionState } from "react";
import { subscribeNewsletterAction, type SubscribeState } from "@/app/eshop/newsletter/actions";
import { CONSENT_NOTE, NEWSLETTER_SEGMENTS, SEGMENT_LABELS, type NewsletterSegment } from "@/lib/eshop/newsletter";

// Přihlášení k newsletteru (28. 11. 2026): e-mail + kavárna/domácnost.
// Souhlas platí až po potvrzení v e-mailu (double opt-in).
export default function NewsletterSignup({
  source = "web",
  defaultSegment,
  title = "Novinky a recepty e-mailem",
}: {
  source?: "web" | "pro-kavarny";
  defaultSegment?: NewsletterSegment;
  title?: string;
}) {
  const [state, action, pending] = useActionState<SubscribeState, FormData>(subscribeNewsletterAction, { status: "idle" });
  return (
    <section aria-labelledby={`newsletter-${source}`} className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
      <h2 id={`newsletter-${source}`} className="text-[17px] sm:text-lg font-semibold text-begina-primary-900">
        {title}
      </h2>
      {state.status === "sent" ? (
        <p className="mt-2 text-base text-neutral-800" role="status">
          Děkujeme! Poslali jsme vám e-mail – odběr v něm prosím potvrďte jedním kliknutím.
        </p>
      ) : state.status === "already" ? (
        <p className="mt-2 text-base text-neutral-800" role="status">
          Tuhle adresu už máme, novinky vám chodí. Děkujeme!
        </p>
      ) : (
        <form action={action} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="source" value={source} />
          {/* past na roboty — lidé pole nevidí */}
          <input type="text" name="web" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
            <legend className="sr-only">Kdo jste</legend>
            {NEWSLETTER_SEGMENTS.map((segment) => (
              <label key={segment} className="inline-flex items-center gap-2 text-base">
                <input type="radio" name="segment" value={segment} defaultChecked={segment === defaultSegment} required className="accent-begina-primary-900" />
                {SEGMENT_LABELS[segment]}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="sr-only" htmlFor={`newsletter-email-${source}`}>
              E-mail
            </label>
            <input
              id={`newsletter-email-${source}`}
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="váš e-mail"
              className="h-11 flex-1 rounded-lg border border-neutral-300 px-3 text-base"
            />
            <button type="submit" disabled={pending} className="h-11 rounded-lg bg-begina-primary-900 px-4 font-medium text-white disabled:opacity-60">
              {pending ? "Odesílám…" : "Chci novinky"}
            </button>
          </div>
          {state.status === "error" && (
            <p role="alert" className="text-sm text-[#B40001]">
              {state.error}
            </p>
          )}
          <p className="text-xs text-neutral-600">{CONSENT_NOTE}</p>
        </form>
      )}
    </section>
  );
}
