"use client";

// Online odstoupení (§ 1830a OZ): tlačítko „Odstoupit od smlouvy“ →
// formulář (jméno, e-mail, údaje o smlouvě; ostatní nepovinně) →
// „Potvrdit odstoupení od smlouvy“ → potvrzení na obrazovce + e-mailem.
import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitWithdrawalAction, type WithdrawalState } from "@/app/eshop/odstoupeni-od-smlouvy/actions";
import { WITHDRAW_BUTTON_LABEL, WITHDRAW_CONFIRM_LABEL } from "@/lib/eshop/withdrawal";

const input = "w-full border border-neutral-300 rounded-lg px-3 h-11 text-sm bg-white";

export default function WithdrawalOnline({ prefill }: { prefill: { contract?: string; email?: string } }) {
  const [open, setOpen] = useState(Boolean(prefill.contract));
  const [state, action, pending] = useActionState<WithdrawalState, FormData>(submitWithdrawalAction, { status: "idle" });

  if (state.status === "done") {
    return (
      <section className="rounded-2xl border border-begina-primary-900 p-5 sm:p-6" aria-live="polite">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-begina-primary-900">
          <CheckCircle2 aria-hidden="true" className="w-6 h-6" />
          Odstoupení jsme přijali
        </h2>
        <p className="mt-2 text-sm text-neutral-700">
          Odesláno {state.submittedAt}. Potvrzení s obsahem prohlášení jsme poslali na {state.email}.
        </p>
        <dl className="mt-4 grid gap-2 text-sm">
          {state.lines.map(([label, value]) => (
            <div key={label} className="grid sm:grid-cols-[12rem_1fr] gap-x-3">
              <dt className="text-neutral-500">{label}</dt>
              <dd className="whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-lg bg-begina-primary-900 hover:bg-begina-primary-800 text-white font-medium px-6 h-12 text-base"
      >
        {WITHDRAW_BUTTON_LABEL}
      </button>
    );
  }

  const error = state.status === "error" ? state : null;
  const invalid = (name: string) => (error?.field === name ? true : undefined);
  return (
    <form action={action} className="rounded-2xl border border-neutral-300 p-5 sm:p-6 flex flex-col gap-4" noValidate>
      <h2 className="text-lg font-semibold">{WITHDRAW_BUTTON_LABEL}</h2>
      <p className="text-sm text-neutral-600">
        Vyplňte prosím tři údaje a odstoupení potvrďte. Potvrzení o přijetí vám hned pošleme e-mailem.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Jméno a příjmení</span>
        <input name="name" autoComplete="name" required aria-invalid={invalid("name")} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">E-mail pro potvrzení</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={prefill.email}
          aria-invalid={invalid("email")}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Číslo objednávky</span>
        <input
          name="contract"
          required
          defaultValue={prefill.contract}
          aria-invalid={invalid("contract")}
          placeholder="např. 9260010 — nebo datum nákupu a co jste objednali"
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Které zboží vracíte <span className="font-normal text-neutral-500">(nepovinné — prázdné = celá objednávka)</span>
        </span>
        <textarea name="items" rows={2} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Poznámka <span className="font-normal text-neutral-500">(nepovinné)</span>
        </span>
        <textarea name="note" rows={2} className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white" />
      </label>
      {/* past na roboty — člověk pole nevidí */}
      <input name="web" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {error && (
        <p role="alert" className="text-sm text-begina-accent-900 bg-begina-accent-100 rounded-lg px-3 py-2">
          {error.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-begina-primary-900 hover:bg-begina-primary-800 disabled:opacity-60 text-white font-medium h-12 text-base"
      >
        {pending ? "Odesílám…" : WITHDRAW_CONFIRM_LABEL}
      </button>
    </form>
  );
}
