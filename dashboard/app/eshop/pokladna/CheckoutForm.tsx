"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { getProduct } from "@/lib/eshop/catalog";
import { shippingMethods, paymentMethods, getShippingMethod } from "@/lib/eshop/shipping";
import { formatKc } from "@/lib/format";
import { useCart, useHydrated } from "@/components/eshop/useCart";
import { submitCheckoutAction, type CheckoutState } from "./actions";

const initialState: CheckoutState = null;

const inputClass =
  "w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm text-begina-primary-900 bg-white focus:outline-none focus:border-begina-primary-700";
const labelClass = "text-xs text-neutral-500 mb-1 block";

// Pole jsou řízená (controlled) — React 19 po dokončení form action
// resetuje neřízené inputy, a zákazník by po chybové hlášce přišel
// o všechno, co vyplnil.
type Values = {
  name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  zip: string;
  note: string;
  shippingMethodId: string;
  paymentMethodId: string;
  termsAccepted: boolean;
};

const emptyValues: Values = {
  name: "",
  email: "",
  phone: "",
  street: "",
  city: "",
  zip: "",
  note: "",
  shippingMethodId: shippingMethods[0].id,
  paymentMethodId: paymentMethods[0].id,
  termsAccepted: false,
};

export default function CheckoutForm() {
  const { cart, clear } = useCart();
  const hydrated = useHydrated();
  const [state, formAction, pending] = useActionState(submitCheckoutAction, initialState);
  const [values, setValues] = useState<Values>(emptyValues);

  const confirmation = state && "confirmation" in state ? state.confirmation : null;

  useEffect(() => {
    if (confirmation) {
      clear();
    }
  }, [confirmation, clear]);

  if (confirmation) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <CircleCheck className="w-6 h-6 text-begina-primary-900" />
          <h1 className="text-2xl font-semibold tracking-tight">Děkujeme za objednávku</h1>
        </div>
        <p className="text-sm text-begina-accent-900 bg-begina-accent-100 rounded-lg px-3 py-2 mb-6">
          Náhled: objednávka nebyla nikam odeslána. V ostré verzi se uloží do Objednávek
          v Moje Begina a zákazníkovi přijde potvrzovací e-mail na {confirmation.email}.
        </p>
        <div className="border border-neutral-200 rounded-2xl p-5 text-sm">
          <ul className="divide-y divide-neutral-100">
            {confirmation.pricedCart.lines.map((line) => (
              <li key={line.slug} className="py-2 flex justify-between gap-3">
                <span>
                  {line.quantity}× {line.name}
                </span>
                <span className="tabular-nums">{formatKc(line.lineTotalKc)}</span>
              </li>
            ))}
            <li className="py-2 flex justify-between gap-3">
              <span>{confirmation.pricedCart.shipping.label}</span>
              <span className="tabular-nums">{formatKc(confirmation.pricedCart.shippingKc)}</span>
            </li>
            <li className="pt-3 flex justify-between gap-3 font-semibold">
              <span>Celkem</span>
              <span className="tabular-nums">{formatKc(confirmation.pricedCart.totalKc)}</span>
            </li>
          </ul>
          <dl className="mt-5 grid grid-cols-[7rem_1fr] gap-y-1.5 text-neutral-600">
            <dt>Zákazník</dt>
            <dd className="text-begina-primary-900">
              {confirmation.name}, {confirmation.phone}
            </dd>
            <dt>Doručení</dt>
            <dd className="text-begina-primary-900">
              {confirmation.address
                ? `${confirmation.address.street}, ${confirmation.address.zip} ${confirmation.address.city}`
                : confirmation.pricedCart.shipping.label}
            </dd>
            <dt>Platba</dt>
            <dd className="text-begina-primary-900">{confirmation.payment.label}</dd>
            {confirmation.note && (
              <>
                <dt>Poznámka</dt>
                <dd className="text-begina-primary-900">{confirmation.note}</dd>
              </>
            )}
          </dl>
        </div>
        <Link href="/eshop" className="mt-6 inline-block text-sm font-medium underline underline-offset-2">
          Zpět do e-shopu
        </Link>
      </div>
    );
  }

  if (!hydrated) {
    return <p className="text-sm text-neutral-500">Načítám košík…</p>;
  }

  const lines = cart.flatMap((line) => {
    const product = getProduct(line.slug);
    return product ? [{ ...line, product, lineTotalKc: product.priceKc * line.quantity }] : [];
  });

  if (lines.length === 0) {
    return (
      <div className="border border-dashed border-neutral-300 rounded-2xl p-8 text-center">
        <p className="text-neutral-600 mb-4">V košíku nic není.</p>
        <Link href="/eshop" className="inline-flex bg-begina-primary-900 text-white text-sm font-medium rounded-lg px-4 py-2.5">
          Vybrat polévky
        </Link>
      </div>
    );
  }

  const shipping = getShippingMethod(values.shippingMethodId) ?? shippingMethods[0];
  const subtotalKc = lines.reduce((sum, line) => sum + line.lineTotalKc, 0);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form action={formAction} className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-8 lg:gap-10 items-start">
      <input type="hidden" name="cart" value={JSON.stringify(cart)} />

      <div className="flex flex-col gap-8">
        <h1 className="text-2xl font-semibold tracking-tight">Objednávka</h1>

        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium mb-3">Kontaktní údaje</legend>
          <div>
            <label htmlFor="name" className={labelClass}>Jméno a příjmení</label>
            <input id="name" name="name" autoComplete="name" required value={values.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="email" className={labelClass}>E-mail</label>
              <input id="email" name="email" type="email" autoComplete="email" required value={values.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>Telefon</label>
              <input id="phone" name="phone" type="tel" autoComplete="tel" required value={values.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-medium mb-3">Doručení</legend>
          <div className="flex flex-col gap-2">
            {shippingMethods.map((method) => (
              <label
                key={method.id}
                className={`flex items-start gap-3 border rounded-xl p-3.5 cursor-pointer ${
                  values.shippingMethodId === method.id ? "border-begina-primary-900" : "border-neutral-200"
                }`}
              >
                <input
                  type="radio"
                  name="shippingMethodId"
                  value={method.id}
                  checked={values.shippingMethodId === method.id}
                  onChange={() => set("shippingMethodId", method.id)}
                  className="mt-1 accent-begina-primary-900"
                />
                <span className="flex-1">
                  <span className="flex justify-between gap-3 text-sm font-medium">
                    {method.label}
                    <span className="tabular-nums">{method.priceKc === 0 ? "Zdarma" : formatKc(method.priceKc)}</span>
                  </span>
                  <span className="block text-xs text-neutral-500 mt-0.5">{method.description}</span>
                </span>
              </label>
            ))}
          </div>

          {shipping.requiresAddress && (
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label htmlFor="street" className={labelClass}>Ulice a číslo</label>
                <input id="street" name="street" autoComplete="street-address" required value={values.street} onChange={(e) => set("street", e.target.value)} className={inputClass} />
              </div>
              <div className="grid grid-cols-[1fr_8rem] gap-3">
                <div>
                  <label htmlFor="city" className={labelClass}>Město</label>
                  <input id="city" name="city" autoComplete="address-level2" required value={values.city} onChange={(e) => set("city", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="zip" className={labelClass}>PSČ</label>
                  <input id="zip" name="zip" autoComplete="postal-code" inputMode="numeric" required value={values.zip} onChange={(e) => set("zip", e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="font-medium mb-3">Platba</legend>
          <div className="flex flex-col gap-2">
            {paymentMethods.map((method) => (
              <label
                key={method.id}
                className={`flex items-start gap-3 border rounded-xl p-3.5 ${
                  method.available ? "cursor-pointer" : "opacity-50 cursor-not-allowed"
                } ${values.paymentMethodId === method.id ? "border-begina-primary-900" : "border-neutral-200"}`}
              >
                <input
                  type="radio"
                  name="paymentMethodId"
                  value={method.id}
                  disabled={!method.available}
                  checked={values.paymentMethodId === method.id}
                  onChange={() => set("paymentMethodId", method.id)}
                  className="mt-1 accent-begina-primary-900"
                />
                <span>
                  <span className="block text-sm font-medium">{method.label}</span>
                  <span className="block text-xs text-neutral-500 mt-0.5">{method.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="note" className={labelClass}>Poznámka k objednávce (nepovinné)</label>
          <textarea id="note" name="note" rows={3} value={values.note} onChange={(e) => set("note", e.target.value)} className={inputClass} />
        </div>
      </div>

      <aside className="bg-begina-primary-50 border border-neutral-200 rounded-2xl p-5 lg:sticky lg:top-20">
        <h2 className="font-medium mb-3">Shrnutí</h2>
        <ul className="text-sm divide-y divide-neutral-200">
          {lines.map((line) => (
            <li key={line.slug} className="py-2 flex justify-between gap-3">
              <span>
                {line.quantity}× {line.product.name}
              </span>
              <span className="tabular-nums">{formatKc(line.lineTotalKc)}</span>
            </li>
          ))}
          <li className="py-2 flex justify-between gap-3 text-neutral-600">
            <span>{shipping.label}</span>
            <span className="tabular-nums">{formatKc(shipping.priceKc)}</span>
          </li>
          <li className="pt-3 flex justify-between gap-3 font-semibold">
            <span>Celkem</span>
            <span className="tabular-nums">{formatKc(subtotalKc + shipping.priceKc)}</span>
          </li>
        </ul>

        <label className="mt-5 flex items-start gap-2 text-xs text-neutral-600">
          <input
            type="checkbox"
            name="termsAccepted"
            required
            checked={values.termsAccepted}
            onChange={(e) => set("termsAccepted", e.target.checked)}
            className="mt-0.5 accent-begina-primary-900"
          />
          Souhlasím s obchodními podmínkami a beru na vědomí zpracování osobních údajů.
        </label>

        {state && "error" in state && (
          <p className="mt-4 text-sm text-begina-accent-900 bg-begina-accent-100 rounded-lg px-3 py-2" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 w-full bg-begina-primary-900 hover:bg-begina-primary-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg h-11"
        >
          {pending ? "Odesílám…" : "Objednat s povinností platby"}
        </button>
        <Link href="/eshop/kosik" className="mt-3 block text-center text-sm text-neutral-600 hover:underline">
          Upravit košík
        </Link>
      </aside>
    </form>
  );
}
