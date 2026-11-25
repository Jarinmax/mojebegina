"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState } from "react";
import { CAFE_FORM_DONE, CAFE_FORM_HEADING, type CafeField, type CafeFormPlace } from "@/lib/eshop/cafePage";
import { submitCafeInquiryAction, type CafeFormState } from "./actions";

const input =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 h-11 text-base text-[#2A2622] focus:outline-none focus:ring-2 focus:ring-[#5E6B34] aria-[invalid=true]:border-[#A51C1C]";

/** heading/anchorId: na Pro kavárny a bistra je při objednávce ochutnávky tenhle formulář druhá možnost (20. 11. 2026). */
export default function CafeForm({ place = "kavarny", heading = CAFE_FORM_HEADING, anchorId = "ochutnavka", intro }: { place?: CafeFormPlace; heading?: string; anchorId?: string; intro?: string }) {
  const [state, action, pending] = useActionState<CafeFormState, FormData>(submitCafeInquiryAction, { status: "idle" });
  const invalid = (field: CafeField) => (state.status === "error" && state.field === field ? true : undefined);

  if (state.status === "done") {
    return (
      <section id={anchorId} className="rounded-2xl border border-[#5E6B34] bg-[#FAF6EF] p-6 text-center" aria-live="polite">
        <CheckCircle2 aria-hidden="true" className="w-10 h-10 mx-auto text-[#5E6B34]" />
        <p className="mt-3 text-lg font-semibold text-[#2A2622]">{CAFE_FORM_DONE}</p>
      </section>
    );
  }

  return (
    <form id={anchorId} action={action} className="w-full max-w-2xl mx-auto rounded-2xl border border-[#EDE5D8] bg-[#FAF6EF] p-5 sm:p-6 flex flex-col gap-3 scroll-mt-24" noValidate>
      <h2 className="font-serif text-xl sm:text-2xl text-[#2A2622]">{heading}</h2>
      {intro && <p className="-mt-2 text-base leading-normal text-neutral-700">{intro}</p>}
      <input type="hidden" name="misto" value={place} />
      {/* 25. 11. 2026 (Lucie): menší formulář – pole po dvou vedle sebe, bez Města, poznámka schovaná */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-base">
          <span className="font-medium">Název podniku</span>
          <input name="venue" autoComplete="organization" required aria-invalid={invalid("venue")} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-base">
          <span className="font-medium">Jméno a příjmení</span>
          <input name="name" autoComplete="name" required aria-invalid={invalid("name")} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-base">
          <span className="font-medium">Telefon</span>
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required aria-invalid={invalid("phone")} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-base">
          <span className="font-medium">
            E-mail <span className="font-normal text-neutral-600">(nepovinné)</span>
          </span>
          <input name="email" type="email" inputMode="email" autoComplete="email" aria-invalid={invalid("email")} className={input} />
        </label>
      </div>
      <details className="text-base" open={invalid("note") ? true : undefined}>
        <summary className="cursor-pointer select-none font-medium text-[#4A5527] underline underline-offset-4 w-fit">+ Přidat poznámku</summary>
        <textarea name="note" rows={3} aria-label="Poznámka" aria-invalid={invalid("note")} className={`${input} h-auto py-2.5 mt-2`} />
      </details>
      {/* past na roboty — člověk pole nevidí */}
      <div className="hidden" aria-hidden="true">
        <label>
          Web
          <input name="web" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-base text-[#A51C1C]">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-lg bg-[#A51C1C] hover:bg-[#8C1717] disabled:opacity-60 text-white font-semibold px-6 h-11 text-base"
      >
        {pending ? "Odesílám…" : "Chci, abyste mi zavolali"}
      </button>
      <p className="text-sm text-neutral-600">
        Údaje použijeme jen k tomu, abychom se vám ozvali. Více v{" "}
        <a href="/ochrana-osobnich-udaju" className="underline underline-offset-2">
          zásadách ochrany osobních údajů
        </a>
        .
      </p>
    </form>
  );
}
