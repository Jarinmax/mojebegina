"use client";

// Pole „Uplatnit slevový kupon“ + „Uplatnit“, uplatněné kódy s výší slevy a odebráním,
// vysvětlení u neplatného kódu. Stav drží useCoupons (sdílený košík ↔ pokladna).
import { useState } from "react";
import { BadgePercent, Tag, X } from "lucide-react";
import { couponDisplayName, PARTNER_CODE } from "@/lib/eshop/coupons";
import { formatKc } from "@/lib/format";
import type { useCoupons } from "./useCoupons";

type Coupons = ReturnType<typeof useCoupons>;

export default function CouponBox({
  coupons,
  className = "",
  partnerHint = false,
}: {
  coupons: Coupons;
  className?: string;
  /** v košíku: upozornění, že partnerskou slevu e-shop nabídne podle e-mailu v pokladně */
  partnerHint?: boolean;
}) {
  const [value, setValue] = useState("");
  const { codes, preview, pending, inputError, apply, remove, offer } = coupons;
  const discountOf = (code: string) => preview.applied.find((a) => a.code === code);
  const errorOf = (code: string) => preview.rejected.find((r) => r.code === code)?.error;

  async function submit() {
    if (await apply(value)) setValue("");
  }

  return (
    <div className={className}>
      {offer && (
        <div className="mb-4 rounded-xl border border-begina-primary-900 bg-white p-3.5" role="status">
          <p className="flex items-start gap-2 text-sm font-medium text-begina-primary-900">
            <BadgePercent aria-hidden="true" className="w-5 h-5 shrink-0" />
            Dosáhli jste partnerské úrovně — sleva {offer.percent} % na zboží.
          </p>
          <p className="mt-1 text-xs text-neutral-600 pl-7">
            Podle vašich uhrazených nákupů za minulý měsíc. Na tento košík ušetříte {formatKc(offer.discountKc)}.
          </p>
          <button
            type="button"
            onClick={() => void apply(PARTNER_CODE)}
            disabled={pending}
            className="mt-3 w-full bg-begina-primary-900 hover:bg-begina-primary-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg h-10"
          >
            Uplatnit partnerskou slevu {offer.percent} %
          </button>
        </div>
      )}
      <label htmlFor="coupon-code" className="text-sm font-semibold block mb-1.5">
        Uplatnit slevový kupon
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Enter uplatní kód, ne odešle objednávku
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={64}
          aria-invalid={inputError ? true : undefined}
          aria-describedby={inputError ? "coupon-error" : undefined}
          className="flex-1 min-w-0 border border-neutral-300 rounded-lg px-3 h-11 text-sm uppercase placeholder:normal-case bg-white"
          placeholder="Zadejte kód kuponu"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={pending}
          className="shrink-0 border border-begina-primary-900 text-sm font-medium rounded-lg px-4 h-11 hover:bg-white disabled:opacity-60"
        >
          Uplatnit
        </button>
      </div>
      {inputError && (
        <p id="coupon-error" role="alert" className="mt-2 text-xs text-begina-accent-900 bg-begina-accent-100 rounded-lg px-2.5 py-1.5">
          {inputError}
        </p>
      )}

      {codes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" aria-live="polite">
          {codes.map((code) => {
            const ok = discountOf(code);
            const error = errorOf(code);
            return (
              <li key={code} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Tag aria-hidden="true" className="w-4 h-4" />
                    {couponDisplayName({ code, partnerPercent: ok?.partnerPercent })}
                  </span>
                  <span className="flex items-center gap-2">
                    {ok && (
                      <span className="tabular-nums text-begina-primary-900">
                        {ok.discountKc > 0 ? `−${formatKc(ok.discountKc)}` : ""}
                        {ok.freeShipping ? `${ok.discountKc > 0 ? " + " : ""}doprava zdarma` : ""}
                      </span>
                    )}
                    {!ok && !error && pending && <span className="text-xs text-neutral-500">ověřuji…</span>}
                    <button
                      type="button"
                      onClick={() => remove(code)}
                      className="p-1 text-neutral-500 hover:text-begina-accent-700"
                      aria-label={`Odebrat ${couponDisplayName({ code, partnerPercent: ok?.partnerPercent })}`}
                    >
                      <X aria-hidden="true" className="w-4 h-4" />
                    </button>
                  </span>
                </div>
                {!ok && !error && preview.pendingEmail.includes(code) && (
                  <p className="mt-1 text-xs text-neutral-500">Kupon ověříme podle vašeho e-mailu v pokladně.</p>
                )}
                {error && (
                  <p role="alert" className="mt-1 text-xs text-begina-accent-900 bg-begina-accent-100 rounded-lg px-2.5 py-1.5">
                    {error} Kód se teď neuplatní.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {partnerHint && !offer && !coupons.email && !codes.includes(PARTNER_CODE) && (
        <p className="mt-3 text-xs text-neutral-500">
          Jste partner Beginy? Partnerskou slevu podle nákupů za minulý měsíc vám nabídneme v pokladně po zadání e-mailu.
        </p>
      )}
      {preview.emailCheckPending && (
        <p className="mt-2 text-xs text-neutral-500">Některý kód platí jen pro určitý e-mail — ověříme ho podle e-mailu v pokladně.</p>
      )}
    </div>
  );
}
