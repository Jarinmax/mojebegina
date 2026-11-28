"use client";

import { useActionState } from "react";
import { sendLeadNewsletterConfirmationAction, type ActionState } from "../../actions";
import { CALL_QUESTION, NEWSLETTER_SEGMENTS, SEGMENT_LABELS, type NewsletterSegment, type NewsletterStatus } from "@/lib/eshop/newsletter";

export type NewsletterCardStatus = {
  status: NewsletterStatus;
  segment: NewsletterSegment | null;
  sourceLabel: string;
  dateLabel: string;
} | null;

// Newsletter u leadu (28. 11. 2026): stav souhlasu + otázka do hovoru.
// Tlačítko jen pošle potvrzovací e-mail — souhlas platí až po kliknutí zákazníka.
export default function NewsletterConsentCard({
  leadId,
  hasEmail,
  current,
  defaultSegment,
}: {
  leadId: string;
  hasEmail: boolean;
  current: NewsletterCardStatus;
  defaultSegment: NewsletterSegment | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendLeadNewsletterConfirmationAction, null);

  const badge =
    current?.status === "confirmed"
      ? { text: `✅ Odebírá newsletter (${current.segment ? SEGMENT_LABELS[current.segment] : "bez segmentu"}) – potvrzeno ${current.dateLabel}`, cls: "bg-green-50 text-green-800 border-green-200" }
      : current?.status === "pending"
        ? { text: `⏳ Čeká na potvrzení zákazníkem – e-mail odeslán ${current.dateLabel} (${current.sourceLabel})`, cls: "bg-amber-50 text-amber-800 border-amber-200" }
        : current?.status === "unsubscribed"
          ? { text: `🚫 Odhlásil se ${current.dateLabel} – newsletter mu neposílat`, cls: "bg-neutral-100 text-neutral-700 border-neutral-200" }
          : { text: "Zatím bez souhlasu s newsletterem", cls: "bg-neutral-50 text-neutral-600 border-neutral-200" };

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
      <p className="text-sm font-medium text-begina-primary-900">📧 Newsletter</p>
      <p className={`mt-2 text-sm rounded-lg border px-3 py-2 ${badge.cls}`}>{badge.text}</p>
      {current?.status !== "confirmed" && (
        <>
          <p className="mt-3 text-sm text-neutral-700">
            Zeptej se: <span className="italic">„{CALL_QUESTION}“</span>
          </p>
          {hasEmail ? (
            <form action={action} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="leadId" value={leadId} />
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {NEWSLETTER_SEGMENTS.map((segment) => (
                  <label key={segment} className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" name="segment" value={segment} defaultChecked={segment === (current?.segment ?? defaultSegment)} required />
                    {SEGMENT_LABELS[segment]}
                  </label>
                ))}
              </div>
              <button type="submit" disabled={pending} className="self-start text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2.5 disabled:opacity-60">
                {pending ? "Odesílám…" : "Řekl ano – poslat potvrzovací e-mail"}
              </button>
              <p className="text-xs text-neutral-500">Když řekne ne, nic neposílej. Odběr platí, až zákazník klikne v e-mailu na „Potvrdit odběr“.</p>
            </form>
          ) : (
            <p className="mt-2 text-xs text-amber-800">Lead nemá e-mail – zeptej se na něj a doplň ho.</p>
          )}
        </>
      )}
      {state && "error" in state && <p role="alert" className="mt-2 text-sm text-[#B40001]">{state.error}</p>}
      {state && "success" in state && <p role="status" className="mt-2 text-sm text-green-800">{state.success}</p>}
    </div>
  );
}
