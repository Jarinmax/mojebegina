"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { AGE_RESTRICTION_NOTICE } from "@/lib/eshop/productRules";
import { resolveCartLines } from "@/lib/eshop/cart";
import { useCatalog } from "@/components/eshop/CatalogProvider";
import { shippingMethods, paymentMethodsFor, getShippingMethod } from "@/lib/eshop/shipping";
import { formatKc } from "@/lib/format";
import { useCart, useHydrated } from "@/components/eshop/useCart";
import { submitCheckoutAction, type CheckoutState } from "./actions";
import { INFO_PAGES } from "@/lib/eshop/infoPages";

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
  ageConfirmed: boolean;
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
  paymentMethodId: "prevod",
  termsAccepted: false,
  ageConfirmed: false,
};

export default function CheckoutForm({ cardPaymentAvailable = false }: { cardPaymentAvailable?: boolean }) {
  const paymentMethods = paymentMethodsFor(cardPaymentAvailable);
  const { cart, clear } = useCart();
  const catalog = useCatalog();
  const hydrated = useHydrated();
  const [state, formAction, pending] = useActionState(submitCheckoutAction, initialState);
  const [values, setValues] = useState<Values>(emptyValues);
  // Token = budoucí id objednávky. Dvojí odeslání (dvojklik, opakování po
  // výpadku sítě) tak na serveru nevytvoří dvě objednávky.
  const [orderToken] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : ""
  );

  const confirmation = state && "confirmation" in state ? state.confirmation : null;
  const savedOrderId = state && "confirmation" in state ? state.savedOrderId : null;
  const email = state && "confirmation" in state ? state.email : "off";
  const orderNumber = state && "confirmation" in state ? state.orderNumber : null;

  const redirectTo = state && "redirectTo" in state ? state.redirectTo : null;

  useEffect(() => {
    if (confirmation) {
      clear();
    }
  }, [confirmation, clear]);

  // Platba kartou: objednávka je uložená, pokračuje se na platební stránku Stripe.
  useEffect(() => {
    if (redirectTo) {
      clear();
      window.location.assign(redirectTo);
    }
  }, [redirectTo, clear]);

  if (redirectTo) {
    return <p className="text-sm text-neutral-600">Přesměrovávám na platbu kartou…</p>;
  }

  if (confirmation) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <CircleCheck className="w-6 h-6 text-begina-primary-900" />
          <h1 className="text-2xl font-semibold tracking-tight">Děkujeme za objednávku</h1>
        </div>
        {savedOrderId ? (
          <p className="text-sm text-begina-accent-900 bg-begina-accent-100 rounded-lg px-3 py-2 mb-6">
            Testovací provoz: objednávka je uložená v Objednávkách Moje Begina ({orderNumber !== null ? "číslo" : "reference"}{" "}
            <span className="font-mono">{orderNumber ?? savedOrderId.slice(0, 8)}</span>).{" "}
            {email === "sent"
              ? "Potvrzení jsme poslali e-mailem (v testovacím provozu jen na testovací adresy)."
              : email === "failed"
                ? "Potvrzovací e-mail se nepodařilo odeslat — objednávka je i tak uložená."
                : "Potvrzovací e-mail se v tomto prostředí neposílá."}
          </p>
        ) : (
          <p className="text-sm text-begina-accent-900 bg-begina-accent-100 rounded-lg px-3 py-2 mb-6">
            Náhled: objednávka nebyla nikam odeslána. V ostré verzi se uloží do Objednávek
            v Moje Begina a zákazníkovi přijde potvrzovací e-mail na {confirmation.email}.
          </p>
        )}
        <div className="border border-neutral-200 rounded-2xl p-5 text-sm">
          <ul className="divide-y divide-neutral-100">
            {confirmation.pricedCart.lines.map((line) => (
              <li key={line.sku} className="py-2 flex justify-between gap-3">
                <span>
                  {line.quantity}× {line.name}
                </span>
                <span className="tabular-nums whitespace-nowrap">{formatKc(line.lineTotalKc)}</span>
              </li>
            ))}
            <li className="py-2 flex justify-between gap-3">
              <span>{confirmation.pricedCart.shipping.label}</span>
              <span className="tabular-nums whitespace-nowrap">{formatKc(confirmation.pricedCart.shippingKc)}</span>
            </li>
            <li className="pt-3 flex justify-between gap-3 font-semibold">
              <span>Celkem</span>
              <span className="tabular-nums whitespace-nowrap">{formatKc(confirmation.pricedCart.totalKc)}</span>
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
        {savedOrderId && confirmation.payment.id === "prevod" && (
          <Link
            href={`/eshop/objednavka/${savedOrderId}`}
            className="mt-6 flex w-full justify-center bg-begina-primary-900 text-white text-sm font-medium rounded-lg px-4 py-2.5"
          >
            Platební údaje a QR kód
          </Link>
        )}
        <Link href="/eshop" className="mt-6 inline-block text-sm font-medium underline underline-offset-2">
          Zpět do e-shopu
        </Link>
      </div>
    );
  }

  if (!hydrated) {
    return <p className="text-sm text-neutral-500">Načítám košík…</p>;
  }

  const lines = resolveCartLines(cart, catalog);
  const containsAgeRestricted = lines.some((line) => line.product.isAgeRestricted);

  if (lines.length === 0) {
    return (
      <div className="border border-dashed border-neutral-300 rounded-2xl p-8 text-center">
        <p className="text-neutral-600 mb-4">V košíku nic není.</p>
        <Link href="/eshop" className="inline-flex bg-begina-primary-900 text-white text-sm font-medium rounded-lg px-4 py-2.5">
          Prohlédnout nabídku
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
      <input type="hidden" name="orderToken" value={orderToken} />
      {/* Past na roboty — člověk pole nevidí ani na něj neskočí tabulátorem. */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label htmlFor="website">Web (nevyplňujte)</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

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
                    <span className="tabular-nums whitespace-nowrap">{method.priceKc === 0 ? "Zdarma" : formatKc(method.priceKc)}</span>
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
            <li key={line.sku} className="py-2 flex justify-between gap-3">
              <span>
                {line.quantity}× {line.name}
              </span>
              <span className="tabular-nums whitespace-nowrap">{formatKc(line.lineTotalKc)}</span>
            </li>
          ))}
          <li className="py-2 flex justify-between gap-3 text-neutral-600">
            <span>{shipping.label}</span>
            <span className="tabular-nums whitespace-nowrap">{formatKc(shipping.priceKc)}</span>
          </li>
          <li className="pt-3 flex justify-between gap-3 font-semibold">
            <span>Celkem</span>
            <span className="tabular-nums whitespace-nowrap">{formatKc(subtotalKc + shipping.priceKc)}</span>
          </li>
        </ul>

        {containsAgeRestricted && (
          <label className="mt-5 flex items-start gap-2 text-xs text-neutral-600">
            <input
              type="checkbox"
              name="ageConfirmed"
              required
              checked={values.ageConfirmed}
              onChange={(e) => set("ageConfirmed", e.target.checked)}
              className="mt-0.5 accent-begina-primary-900"
            />
            <span>
              Potvrzuji, že je mi alespoň 18 let. {AGE_RESTRICTION_NOTICE} Věk ověříme i při předání.
            </span>
          </label>
        )}

        <label className="mt-3 flex items-start gap-2 text-xs text-neutral-600">
          <input
            type="checkbox"
            name="termsAccepted"
            required
            checked={values.termsAccepted}
            onChange={(e) => set("termsAccepted", e.target.checked)}
            className="mt-0.5 accent-begina-primary-900"
          />
          <span>
            Souhlasím s{" "}
            <a href={INFO_PAGES.terms.path} target="_blank" rel="noopener" className="underline underline-offset-2">
              obchodními podmínkami
            </a>{" "}
            a beru na vědomí{" "}
            <a href={INFO_PAGES.privacy.path} target="_blank" rel="noopener" className="underline underline-offset-2">
              zpracování osobních údajů
            </a>
            .
          </span>
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
