"use client";

import { couponDisplayName } from "@/lib/eshop/coupons";
import { useActionState, useEffect, useRef, useState } from "react";
import ShopLink from "@/components/eshop/ShopLink";
import { useEshopHref } from "@/components/eshop/EshopBase";
import { CircleCheck } from "lucide-react";
import { AGE_RESTRICTION_NOTICE, isOrderable, NOT_ORDERABLE_NOTICE } from "@/lib/eshop/productRules";
import { resolveCartLines } from "@/lib/eshop/cart";
import { useCatalog } from "@/components/eshop/CatalogProvider";
import { shippingDestination, slovakiaDeliveryZone,
  shippingMethodsFor,
  DEFAULT_SHIPPING_METHOD_ID,
  paymentMethodsFor,
  slovakPayer,
  SLOVAKIA_CARD_ONLY_NOTE,
  SLOVAKIA_SELF_TRANSPORT,
  SLOVAKIA_SELF_TRANSPORT_NOTE,
  slovakiaSelfTransport,
  defaultPaymentMethodId,
  quoteLabel,
  quoteShipping,
  quoteZasilkovnaShipping,
  ZASILKOVNA_METHOD_ID,
  type ShippingMode,
} from "@/lib/eshop/shipping";
import {
  ZASILKOVNA_WIDGET_KEY,
  ZASILKOVNA_WIDGET_SCRIPT,
  pointFromWidget,
  type ZasilkovnaPoint,
} from "@/lib/eshop/zasilkovna";
import { isTastingSet } from "@/lib/eshop/tastingSet";
import { isCafeTastingAlcohol, CAFE_TASTING_CHECKOUT_NOTE, CAFE_TASTING_COMPANY_STORAGE, cartHasCafeTasting, parseCafeTastingCompany } from "@/lib/eshop/cafeTasting";
import { VAT_NOTE } from "@/lib/eshop/cafePage";
import { BOX_NAME, BOX_PRICE_KC, boxCount, boxWeightLines, clampBoxes } from "@/lib/eshop/boxOption";
import { formatKc } from "@/lib/format";
import { useCart, useHydrated } from "@/components/eshop/useCart";
import { submitCheckoutAction, type CheckoutState } from "./actions";
import { INFO_PAGES, OPERATOR, SLOVAKIA_ORDER_NOTE } from "@/lib/eshop/infoPages";
import { checkoutMetaSignals, trackMeta } from "@/lib/eshop/metaPixel";
import { trackCompanyCheckout, trackOrderSource } from "@/lib/eshop/funnelClient";
import CouponBox from "@/components/eshop/CouponBox";
import { clearStoredCoupons, rememberCheckoutEmail, useCoupons } from "@/components/eshop/useCoupons";
import PendingOrderNotice from "@/components/eshop/PendingOrderNotice";
import { rememberPendingOrder } from "@/components/eshop/usePendingOrder";
import { storeHandoff, useCustomerHandoff } from "@/components/eshop/useCustomerHandoff";
import { handoffPrefillAction } from "@/app/eshop/kosik/handoffActions";
import type { HandoffPrefill } from "@/lib/eshop/customerHandoff";
import type { CheckoutValue } from "@/lib/eshop/checkout";
import {
  BILLING_COUNTRIES,
  DELIVERY_COUNTRY,
  orderPartyBlocks,
  shippingMethodText,
  type PartyBlock,
} from "@/lib/eshop/orderParties";

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
  companyPurchase: boolean;
  billingCompany: string;
  billingIco: string;
  billingDic: string;
  billingStreet: string;
  billingCity: string;
  billingZip: string;
  billingCountry: string;
  deliverySameAsBilling: boolean;
  recipientName: string;
  recipientCompany: string;
  street: string;
  city: string;
  zip: string;
  recipientPhone: string;
  note: string;
  shippingMethodId: string;
  paymentMethodId: string;
  termsAccepted: boolean;
  ageConfirmed: boolean;
  boxes: number;
};

const emptyValues: Values = {
  name: "",
  email: "",
  phone: "",
  companyPurchase: false,
  billingCompany: "",
  billingIco: "",
  billingDic: "",
  billingStreet: "",
  billingCity: "",
  billingZip: "",
  billingCountry: BILLING_COUNTRIES[0],
  deliverySameAsBilling: true,
  recipientName: "",
  recipientCompany: "",
  street: "",
  city: "",
  zip: "",
  recipientPhone: "",
  note: "",
  shippingMethodId: DEFAULT_SHIPPING_METHOD_ID,
  paymentMethodId: "prevod",
  termsAccepted: false,
  ageConfirmed: false,
  boxes: 0,
};

export default function CheckoutForm({
  cardPaymentAvailable = false,
  shippingMode = "flat",
  zasilkovna = false,
  slovakia = false,
}: {
  cardPaymentAvailable?: boolean;
  shippingMode?: ShippingMode;
  /** Zásilkovna zapnutá (ESHOP_ZASILKOVNA=on) — nabídne se jen u košíku s kapsičkami sirupu */
  zasilkovna?: boolean;
  /** Doručení na Slovensko zapnuté (ESHOP_SLOVAKIA=on) */
  slovakia?: boolean;
}) {
  const allShippingMethods = shippingMethodsFor(shippingMode, { zasilkovna });
  // Zásilkovna: dokud zákazník sám nezvolí doručení, předvybere se (je nejlevnější).
  const [shippingChosen, setShippingChosen] = useState(false);
  const [pickupPoint, setPickupPoint] = useState<ZasilkovnaPoint | null>(null);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  // chyba ze serveru, kterou zákazník mezitím napravil výběrem výdejního místa
  const [resolvedError, setResolvedError] = useState<string | null>(null);
  const { cart, clear } = useCart();
  const catalog = useCatalog();
  const href = useEshopHref();
  const hydrated = useHydrated();
  const [state, formAction, pending] = useActionState(submitCheckoutAction, initialState);
  const [values, setValues] = useState<Values>(() => ({
    ...emptyValues,
    paymentMethodId: defaultPaymentMethodId(cardPaymentAvailable),
  }));
  // Slevové kódy z košíku (localStorage) — e-mail se k ověření omezení
  // předá až chvíli po dopsání, ne po každém písmenu.
  const [couponEmail, setCouponEmail] = useState<string | undefined>(undefined);
  useEffect(() => {
    const email = values.email.trim();
    const timer = setTimeout(() => setCouponEmail(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined), 600);
    return () => clearTimeout(timer);
  }, [values.email]);
  const coupons = useCoupons(cart, couponEmail);
  // e-mail si prohlížeč zapamatuje, aby příště nabídl partnerskou slevu už v košíku
  useEffect(() => {
    if (couponEmail) rememberCheckoutEmail(couponEmail);
  }, [couponEmail]);
  // Nákup za kartu z MojeBegina („Objednat znovu“): údaje karty se načtou
  // ze serveru podle podepsaného pasu a předvyplní se. Zákazník je může
  // upravit — faktura se vystaví podle toho, co v pokladně potvrdí.
  const handoff = useCustomerHandoff();
  const [prefill, setPrefill] = useState<HandoffPrefill | null>(null);
  const [locationId, setLocationId] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    if (!handoff) {
      setPrefill(null);
      return;
    }
    handoffPrefillAction(handoff)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          storeHandoff(null);
          setPrefill(null);
          return;
        }
        const p = result.prefill;
        setPrefill(p);
        const location = p.locations[0] ?? null;
        setLocationId(location?.id ?? "");
        setValues((prev) => ({
          ...prev,
          name: prev.name || p.contact.name || "",
          email: prev.email || p.contact.email || "",
          phone: prev.phone || p.contact.phone || location?.contactPhone || "",
          companyPurchase: true,
          billingCompany: p.company.name,
          billingIco: p.company.ico,
          billingDic: p.company.dic ?? "",
          billingStreet: prev.billingStreet || p.registered?.street || "",
          billingCity: prev.billingCity || p.registered?.city || "",
          billingZip: prev.billingZip || p.registered?.zip || "",
          billingCountry: "Česká republika",
          ...(location ? locationValues(location, p) : {}),
        }));
      })
      .catch(() => {
        if (!cancelled) setPrefill(null);
      });
    return () => {
      cancelled = true;
    };
  }, [handoff]);

  // Ochutnávka do provozu (20. 11. 2026): vždy na firmu s IČO; údaje z výběru
  // na stránce Pro kavárny a bistra (IČO ověřené v ARES) se předvyplní.
  const hasTasting = cartHasCafeTasting(cart);
  const [tastingVenue, setTastingVenue] = useState("");
  useEffect(() => {
    if (!hasTasting) return;
    let stored = null;
    try {
      stored = parseCafeTastingCompany(sessionStorage.getItem(CAFE_TASTING_COMPANY_STORAGE));
    } catch {
      stored = null;
    }
    const company = stored;
    if (company) setTastingVenue(company.venue);
    setValues((prev) => ({
      ...prev,
      companyPurchase: true,
      ...(company
        ? {
            billingCompany: prev.billingCompany || company.company,
            billingIco: prev.billingIco || company.ico,
            billingDic: prev.billingDic || company.dic || "",
            billingStreet: prev.billingStreet || company.street,
            billingCity: prev.billingCity || company.city,
            billingZip: prev.billingZip || company.zip,
            billingCountry: "Česká republika",
          }
        : {}),
    }));
  }, [hasTasting]);

  function chooseLocation(id: string) {
    setLocationId(id);
    const location = prefill?.locations.find((l) => l.id === id);
    if (location && prefill) setValues((prev) => ({ ...prev, ...locationValues(location, prefill) }));
  }

  function leaveHandoff() {
    storeHandoff(null);
    setPrefill(null);
    setValues((prev) => ({ ...prev, companyPurchase: false, billingCompany: "", billingIco: "", billingDic: "", deliverySameAsBilling: true }));
  }

  // Token = budoucí id objednávky. Dvojí odeslání (dvojklik, opakování po
  // výpadku sítě) tak na serveru nevytvoří dvě objednávky.
  const [orderToken] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : ""
  );

  const confirmation = state && "confirmation" in state ? state.confirmation : null;
  const savedOrderId = state && "confirmation" in state ? state.savedOrderId : null;
  const email = state && "confirmation" in state ? state.email : "off";
  const orderNumber = state && "confirmation" in state ? state.orderNumber : null;

  const redirect = state && "redirectTo" in state ? state : null;
  const redirectTo = redirect?.redirectTo ?? null;

  // Meta Pixel (jen se souhlasem): zahájení pokladny jednou za návštěvu stránky.
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (checkoutTracked.current || !hydrated) return;
    const cartLines = resolveCartLines(cart, catalog);
    if (cartLines.length === 0) return;
    checkoutTracked.current = true;
    trackMeta("InitiateCheckout", {
      content_type: "product",
      content_ids: cartLines.map((line) => line.sku),
      num_items: cartLines.reduce((sum, line) => sum + line.quantity, 0),
    });
  }, [hydrated, cart, catalog]);

  // Měření: pokladna na firmu (kavárny a bistra) — zaškrtnuto ručně,
  // předvyplněno z účtu kavárny nebo povinně u ochutnávky do podniku.
  useEffect(() => {
    if (values.companyPurchase || hasTasting) trackCompanyCheckout();
  }, [values.companyPurchase, hasTasting]);

  useEffect(() => {
    if (confirmation) {
      trackOrderSource();
      clear();
      clearStoredCoupons();
    }
  }, [confirmation, clear]);

  // Platba kartou: objednávka je uložená (server vrátil její id). Nejdřív si
  // ji prohlížeč zapamatuje, teprve pak vyprázdní košík a otevře Stripe —
  // návrat ze Stripe (Zpět, obnovení, nová návštěva) tak nabídne „Zaplatit
  // objednávku“ místo nové objednávky (PendingOrderNotice).
  useEffect(() => {
    if (redirect) {
      trackOrderSource();
      rememberPendingOrder(redirect.orderId, redirect.orderNumber);
      clear();
      clearStoredCoupons();
      window.location.assign(redirect.redirectTo);
    }
  }, [redirect, clear]);

  // Meta: souhlas s reklamními cookies a _fbp/_fbc se odešlou s objednávkou;
  // nákup (Purchase) pak pošle server až po úplném zaplacení.
  // Hodnoty se doplní těsně před odesláním (souhlas se mohl změnit).
  function fillMetaSignals(event: React.FormEvent<HTMLFormElement>) {
    const signals = checkoutMetaSignals({ window, document });
    const form = event.currentTarget;
    for (const [name, value] of Object.entries(signals)) {
      const input = form.elements.namedItem(name);
      if (input instanceof HTMLInputElement) input.value = value;
    }
  }

  if (redirectTo) {
    // Po návratu tlačítkem Zpět zůstane stránka v tomto stavu — nabídka
    // zaplatit tutéž objednávku se ukáže pod textem.
    return (
      <div className="max-w-xl mx-auto">
        <p className="text-sm text-neutral-600 mb-4">Přesměrovávám na platbu kartou…</p>
        <PendingOrderNotice />
      </div>
    );
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
            {confirmation.pricedCart.discountKc > 0 && (
              <li className="py-2 flex justify-between gap-3">
                <span>Sleva ({confirmation.pricedCart.coupons.map((c) => couponDisplayName(c)).join(", ")})</span>
                <span className="tabular-nums whitespace-nowrap">−{formatKc(confirmation.pricedCart.discountKc)}</span>
              </li>
            )}
            {confirmation.pricedCart.packaging && (
              <li className="py-2 flex justify-between gap-3">
                <span>
                  {confirmation.pricedCart.packaging.quantity}× {confirmation.pricedCart.packaging.name}
                </span>
                <span className="tabular-nums whitespace-nowrap">{formatKc(confirmation.pricedCart.packaging.lineTotalKc)}</span>
              </li>
            )}
            <li className="py-2 flex justify-between gap-3">
              <span>{confirmation.pricedCart.shipping.label}</span>
              <span className="tabular-nums whitespace-nowrap">{formatKc(confirmation.pricedCart.shippingKc)}</span>
            </li>
            <li className="pt-3 flex justify-between gap-3 font-semibold">
              <span>Celkem</span>
              <span className="tabular-nums whitespace-nowrap">{formatKc(confirmation.pricedCart.totalKc)}</span>
            </li>
          </ul>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {orderPartyBlocks(partiesFromCheckout(confirmation)).map((block) => (
              <PartyCard key={block.title} block={block} />
            ))}
          </div>
          <dl className="mt-5 grid grid-cols-[7rem_1fr] gap-y-1.5 text-neutral-600">
            <dt>Doprava</dt>
            <dd className="text-begina-primary-900">{shippingMethodText(partiesFromCheckout(confirmation))}</dd>
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
          <ShopLink
            href={`/objednavka/${savedOrderId}`}
            className="mt-6 flex w-full justify-center bg-begina-primary-900 text-white text-sm font-medium rounded-lg px-4 py-2.5"
          >
            Platební údaje a QR kód
          </ShopLink>
        )}
        <ShopLink href="/" className="mt-6 inline-block text-sm font-medium underline underline-offset-2">
          Zpět do e-shopu
        </ShopLink>
      </div>
    );
  }

  if (!hydrated) {
    return <p className="text-sm text-neutral-500">Načítám košík…</p>;
  }

  const lines = resolveCartLines(cart, catalog);
  const containsAgeRestricted = lines.some((line) => line.product.isAgeRestricted || isCafeTastingAlcohol(line.variant.sku));
  // Server objednávku s neověřenými alergeny odmítne (priceCart); tady jen
  // zákazníkovi řekneme proč, ještě před vyplněním formuláře.
  const blockedLines = lines.filter((line) => !isOrderable(line.product));

  if (lines.length === 0) {
    return (
      <>
        <PendingOrderNotice />
        <div className="border border-dashed border-neutral-300 rounded-2xl p-8 text-center">
          <p className="text-neutral-600 mb-4">V košíku nic není.</p>
          <ShopLink href="/" className="inline-flex bg-begina-primary-900 text-white text-sm font-medium rounded-lg px-4 py-2.5">
            Prohlédnout nabídku
          </ShopLink>
        </div>
      </>
    );
  }

  // Cena dopravy jen pro zobrazení — server ji spočítá znovu (priceCart).
  // Volitelné krabice (boxOption.ts): jedna na každé balení 3 l mimo sirupy.
  const boxesMax = boxCount(lines);
  const boxes = clampBoxes(values.boxes, boxesMax);
  const boxesKc = boxes * BOX_PRICE_KC;
  // Ochutnávkový set sirupů se do chlazeného balíku přibaluje (hmotnost dopravu
  // nezdražuje); samotný set chlazenou přepravou nejde (tastingSet.ts).
  const onlyTastingSets = lines.length > 0 && lines.every((line) => isTastingSet(line.product));
  const quoteLines = lines.filter((line) => !isTastingSet(line.product)).map((line) => ({
    sku: line.sku,
    name: line.name,
    quantity: line.quantity,
    weightGrams: line.variant.weightGrams,
  })).concat(boxWeightLines(boxes));
  // Zásilkovna se nabízí jen u košíku, kde jsou pouze kapsičky sirupu (zasilkovna.ts);
  // jinak ji zákazník vůbec nevidí. Když ji nabídnout jde, je první.
  const zasilkovnaQuote = quoteZasilkovnaShipping(lines);
  const destination = shippingDestination({ enabled: slovakia, sameAsBilling: values.deliverySameAsBilling, billingCountry: values.billingCountry, zip: values.zip });
  // Zásilkovna jen v Česku — při doručení na Slovensko se vůbec nenabízí.
  const zasilkovnaOffered = zasilkovna && zasilkovnaQuote.available && destination !== "sk";
  const shippingMethods = [
    ...allShippingMethods.filter((method) => method.id === ZASILKOVNA_METHOD_ID && zasilkovnaOffered),
    ...allShippingMethods.filter((method) => method.id !== ZASILKOVNA_METHOD_ID && !(onlyTastingSets && method.id === "rozvoz")),
  ];
  const deliveryCountryLabel = destination === "sk" ? "Slovensko" : DELIVERY_COUNTRY;
  // Slovensko: jen platba kartou (bankovní převod se nenabízí).
  const fromSlovakia = slovakPayer({ billingCountry: values.billingCountry, destination });
  const paymentMethods = paymentMethodsFor(cardPaymentAvailable, { slovakPayer: fromSlovakia });
  const selectedPaymentId = paymentMethods.some((m) => m.id === values.paymentMethodId && m.available)
    ? values.paymentMethodId
    : (paymentMethods.find((m) => m.available)?.id ?? values.paymentMethodId);
  const quotes = new Map(
    shippingMethods.map((method) => [
      method.id,
      method.id === ZASILKOVNA_METHOD_ID ? zasilkovnaQuote : quoteShipping(method, quoteLines, shippingMode, OPERATOR, method.id === "rozvoz" ? destination : "cz"),
    ])
  );
  const selectedShippingId =
    zasilkovnaOffered && !shippingChosen
      ? ZASILKOVNA_METHOD_ID
      : shippingMethods.some((method) => method.id === values.shippingMethodId)
        ? values.shippingMethodId
        : shippingMethods[0].id;
  const shipping = shippingMethods.find((method) => method.id === selectedShippingId) ?? shippingMethods[0];
  const quote = quotes.get(shipping.id)!;

  function openZasilkovnaWidget() {
    setWidgetError(null);
    type PacketaWindow = Window & { Packeta?: { Widget: { pick: (key: string, cb: (point: unknown) => void, options?: object) => void } } };
    const pick = () => {
      const packeta = (window as PacketaWindow).Packeta;
      if (!packeta) {
        setWidgetError("Mapu výdejních míst se nepodařilo načíst. Zkuste to prosím znovu.");
        return;
      }
      packeta.Widget.pick(
        ZASILKOVNA_WIDGET_KEY,
        (raw) => {
          if (raw === null || raw === undefined) return; // zákazník okno zavřel
          const point = pointFromWidget(raw);
          if (point) {
            setPickupPoint(point);
            setResolvedError(state && "error" in state ? state.error : null);
          }
          else setWidgetError("Toto výdejní místo nejde použít — vyberte prosím jiné v České republice.");
        },
        {
          country: "cz",
          language: "cs",
          vendors: [{ country: "cz" }, { country: "cz", group: "zbox" }],
          weight: zasilkovnaQuote.available && zasilkovnaQuote.weightGrams ? zasilkovnaQuote.weightGrams / 1000 : undefined,
        }
      );
    };
    if ((window as PacketaWindow).Packeta) {
      pick();
      return;
    }
    const script = document.createElement("script");
    script.src = ZASILKOVNA_WIDGET_SCRIPT;
    script.async = true;
    script.onload = pick;
    script.onerror = () => setWidgetError("Mapu výdejních míst se nepodařilo načíst. Zkuste to prosím znovu.");
    document.head.appendChild(script);
  }
  const subtotalKc = lines.reduce((sum, line) => sum + line.lineTotalKc, 0);
  // Sleva a doprava zdarma ze slevových kódů (ověřené serverem; při
  // odeslání je server spočítá znovu).
  const discountKc = Math.min(coupons.preview.discountKc, subtotalKc);
  const shippingKc = quote.available && !coupons.preview.freeShipping ? quote.priceKc : 0;
  const appliedCodes = coupons.preview.applied.map((a) => a.code);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <>
    <PendingOrderNotice />
    <form action={formAction} onSubmitCapture={fillMetaSignals} className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-8 lg:gap-10 items-start">
      <input type="hidden" name="cart" value={JSON.stringify(cart)} />
      <input type="hidden" name="couponCodes" value={JSON.stringify(appliedCodes)} />
      <input type="hidden" name="orderToken" value={orderToken} />
      {prefill && handoff && <input type="hidden" name="handoff" value={handoff} />}
      <input type="hidden" name="adConsent" defaultValue="0" />
      <input type="hidden" name="fbp" defaultValue="" />
      <input type="hidden" name="fbc" defaultValue="" />
      {/* Past na roboty — člověk pole nevidí ani na něj neskočí tabulátorem. */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label htmlFor="website">Web (nevyplňujte)</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className="flex flex-col gap-8">
        <h1 className="text-2xl font-semibold tracking-tight">Objednávka</h1>

        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium mb-3">Kontaktní údaje</legend>
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

        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium mb-1">Fakturační údaje</legend>
          <p className="text-xs text-neutral-500 -mt-1">Na tyto údaje vystavíme fakturu.</p>
          {prefill && (
            <div className="rounded-lg border border-begina-primary-700/30 bg-begina-primary-50 px-3 py-2 text-sm">
              <p className="text-begina-primary-900">
                Nakupujete za <strong>{prefill.company.name}</strong> (IČO {prefill.company.ico}) — údaje z MojeBegina.
              </p>
              <p className="text-xs text-neutral-600 mt-0.5">
                Údaje jsme předvyplnili z vaší karty — pokud je něco jinak, opravte to přímo zde, faktura se vystaví podle formuláře.{" "}
                <button type="button" onClick={leaveHandoff} className="underline">Nakupovat bez údajů firmy</button>
              </p>
            </div>
          )}
          <div>
            <label htmlFor="name" className={labelClass}>Jméno a příjmení</label>
            <input id="name" name="name" autoComplete="billing name" required value={values.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
          </div>
          {hasTasting && (
            <>
              <p className="rounded-lg border border-begina-primary-700/30 bg-begina-primary-50 px-3 py-2 text-sm text-begina-primary-900">{CAFE_TASTING_CHECKOUT_NOTE}</p>
              <input type="hidden" name="tastingVenue" value={tastingVenue} />
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="companyPurchase"
              checked={values.companyPurchase || hasTasting}
              onChange={(e) => set("companyPurchase", hasTasting || e.target.checked)}
              aria-disabled={hasTasting || undefined}
              className="accent-begina-primary-900"
            />
            Nakupuji na firmu{hasTasting ? " (u ochutnávky povinné)" : ""}
          </label>
          {(values.companyPurchase || hasTasting) && (
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="billingCompany" className={labelClass}>Název firmy</label>
                <input id="billingCompany" name="billingCompany" autoComplete="billing organization" required value={values.billingCompany} onChange={(e) => set("billingCompany", e.target.value)} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="billingIco" className={labelClass}>IČO</label>
                  <input id="billingIco" name="billingIco" inputMode="numeric" required value={values.billingIco} onChange={(e) => set("billingIco", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="billingDic" className={labelClass}>DIČ (nepovinné)</label>
                  <input id="billingDic" name="billingDic" placeholder="CZ12345678" value={values.billingDic} onChange={(e) => set("billingDic", e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          )}
          <div>
            <label htmlFor="billingStreet" className={labelClass}>Ulice a číslo domu</label>
            <input id="billingStreet" name="billingStreet" autoComplete="billing street-address" required value={values.billingStreet} onChange={(e) => set("billingStreet", e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div>
              <label htmlFor="billingCity" className={labelClass}>Město</label>
              <input id="billingCity" name="billingCity" autoComplete="billing address-level2" required value={values.billingCity} onChange={(e) => set("billingCity", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="billingZip" className={labelClass}>PSČ</label>
              <input id="billingZip" name="billingZip" autoComplete="billing postal-code" inputMode="numeric" required value={values.billingZip} onChange={(e) => set("billingZip", e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="billingCountry" className={labelClass}>Země</label>
            <select id="billingCountry" name="billingCountry" autoComplete="billing country-name" value={values.billingCountry} onChange={(e) => set("billingCountry", e.target.value)} className={inputClass}>
              {BILLING_COUNTRIES.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-medium mb-3">Doručení</legend>
          <div className="flex flex-col gap-2">
            {shippingMethods.map((method) => {
              const methodQuote = quotes.get(method.id)!;
              return (
                <label
                  key={method.id}
                  className={`flex items-start gap-3 border rounded-xl p-3.5 ${
                    methodQuote.available ? "cursor-pointer" : "cursor-not-allowed"
                  } ${selectedShippingId === method.id ? "border-begina-primary-900" : "border-neutral-200"}`}
                >
                  <input
                    type="radio"
                    name="shippingMethodId"
                    value={method.id}
                    disabled={!methodQuote.available}
                    checked={selectedShippingId === method.id}
                    onChange={() => {
                      set("shippingMethodId", method.id);
                      setShippingChosen(true);
                    }}
                    className="mt-1 accent-begina-primary-900"
                  />
                  <span className="flex-1">
                    <span className="flex justify-between gap-3 text-sm font-medium">
                      {method.label}
                      <span className="tabular-nums whitespace-nowrap">{quoteLabel(methodQuote)}</span>
                    </span>
                    <span className="block text-xs text-neutral-500 mt-0.5">
                      {method.id === "rozvoz" && slovakiaSelfTransport(destination)
                        ? "Chlazenou přepravu CoolBalík si objednáte a zaplatíte sami, zboží předáme Vámi objednanému dopravci."
                        : method.id === "rozvoz" && destination === "sk"
                          ? method.description.replace("v České republice", "na Slovensku")
                          : method.description}
                    </span>
                    {!methodQuote.available && (
                      <span className="block text-xs text-begina-accent-900 bg-begina-accent-100 rounded-lg px-2.5 py-1.5 mt-2" role="note">
                        {methodQuote.message}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          {shipping.requiresPickupPoint && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="font-medium text-sm">Výdejní místo</p>
              <input type="hidden" name="pickupPointId" value={pickupPoint?.id ?? ""} />
              <input type="hidden" name="pickupPointName" value={pickupPoint?.name ?? ""} />
              <input type="hidden" name="pickupPointStreet" value={pickupPoint?.street ?? ""} />
              <input type="hidden" name="pickupPointCity" value={pickupPoint?.city ?? ""} />
              <input type="hidden" name="pickupPointZip" value={pickupPoint?.zip ?? ""} />
              {pickupPoint ? (
                <div className="border border-neutral-200 rounded-xl p-3.5 text-sm">
                  <p className="font-medium">{pickupPoint.name}</p>
                  <p className="text-neutral-600">
                    {[pickupPoint.street, `${pickupPoint.zip} ${pickupPoint.city}`].filter(Boolean).join(", ")}
                  </p>
                  <button type="button" onClick={openZasilkovnaWidget} className="underline text-sm mt-2">
                    Změnit výdejní místo
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openZasilkovnaWidget}
                  className="self-start bg-begina-primary-900 text-white text-sm font-medium rounded-lg px-4 py-2.5"
                >
                  Vybrat výdejní místo nebo Z-BOX
                </button>
              )}
              {widgetError && (
                <p className="text-xs text-begina-accent-900 bg-begina-accent-100 rounded-lg px-2.5 py-1.5" role="alert">
                  {widgetError}
                </p>
              )}
              <p className="text-xs text-neutral-500">
                O uložení zásilky vám Zásilkovna pošle zprávu na telefon a e-mail uvedený výše.
              </p>
            </div>
          )}

          {shipping.requiresAddress && (
            <div className="mt-4 flex flex-col gap-3">
              <p className="font-medium text-sm">Doručovací údaje</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="deliverySameAsBilling"
                  checked={values.deliverySameAsBilling}
                  onChange={(e) => set("deliverySameAsBilling", e.target.checked)}
                  className="accent-begina-primary-900"
                />
                Doručit na fakturační údaje
              </label>
              {prefill && prefill.locations.length > 0 && (
                <div>
                  <label htmlFor="handoffLocation" className={labelClass}>Provozovna z MojeBegina</label>
                  <select id="handoffLocation" value={locationId} onChange={(e) => chooseLocation(e.target.value)} className={inputClass}>
                    {prefill.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.label} — {location.street}, {location.zip} {location.city}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {values.deliverySameAsBilling ? (
                <p className="text-xs text-neutral-500">
                  Zásilku doručíme na jméno a adresu z fakturačních údajů, telefon pro doručení je váš kontaktní telefon.
                  {values.billingCountry !== deliveryCountryLabel && ` Doručujeme ale jen v České republice — zadejte prosím jinou doručovací adresu. ${SLOVAKIA_ORDER_NOTE}`}
                </p>
              ) : (
                <>
                  <div>
                    <label htmlFor="recipientName" className={labelClass}>Jméno a příjmení příjemce</label>
                    <input id="recipientName" name="recipientName" autoComplete="shipping name" required value={values.recipientName} onChange={(e) => set("recipientName", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="recipientCompany" className={labelClass}>Firma (nepovinné)</label>
                    <input id="recipientCompany" name="recipientCompany" autoComplete="shipping organization" value={values.recipientCompany} onChange={(e) => set("recipientCompany", e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="street" className={labelClass}>Ulice a číslo domu</label>
                    <input id="street" name="street" autoComplete="shipping street-address" required value={values.street} onChange={(e) => set("street", e.target.value)} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-[1fr_8rem] gap-3">
                    <div>
                      <label htmlFor="city" className={labelClass}>Město</label>
                      <input id="city" name="city" autoComplete="shipping address-level2" required value={values.city} onChange={(e) => set("city", e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="zip" className={labelClass}>PSČ</label>
                      <input id="zip" name="zip" autoComplete="shipping postal-code" inputMode="numeric" required value={values.zip} onChange={(e) => set("zip", e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="deliveryCountry" className={labelClass}>Země</label>
                    <input id="deliveryCountry" value={deliveryCountryLabel} readOnly className={`${inputClass} bg-neutral-50 text-neutral-500`} />
                  </div>
                  <div>
                    <label htmlFor="recipientPhone" className={labelClass}>Telefon pro doručení</label>
                    <input id="recipientPhone" name="recipientPhone" type="tel" autoComplete="shipping tel" required value={values.recipientPhone} onChange={(e) => set("recipientPhone", e.target.value)} className={inputClass} />
                  </div>
                </>
              )}
              {slovakia ? (
                <p className="text-xs text-neutral-500">
                  {SLOVAKIA_SELF_TRANSPORT
                    ? "Doručujeme v České republice. Zákazníci ze Slovenska si chlazenou přepravu objednají sami, alkoholické nápoje na Slovensko neprodáváme; zemi určíme podle PSČ."
                    : "Doručujeme v České republice a na Slovensko. Na Slovensko neposíláme alkoholické nápoje; zemi a cenu dopravy určíme podle PSČ."}
                </p>
              ) : null}
              {slovakia && destination === "sk" && slovakiaSelfTransport(destination) ? (
                <p role="note" className="text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">{SLOVAKIA_SELF_TRANSPORT_NOTE}</p>
              ) : slovakia && destination === "sk" ? (
                slovakiaDeliveryZone(values.deliverySameAsBilling ? values.billingZip : values.zip) === "daily" ? (
                  <p role="note" className="text-xs text-neutral-600">Do vaší oblasti na Slovensku doručujeme chlazenou přepravou jen od úterý do pátku. V pondělí a o víkendu se nedoručuje, zásilka odeslaná na konci týdne proto dorazí až v úterý.</p>
                ) : (
                  <div role="note" className="text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2 flex flex-col gap-2">
                    <p>
                      Do vaší oblasti na Slovensku doručujeme chlazenou přepravou jen ve dvou dnech v týdnu, přeprava proto může trvat až 6 dní. Zboží je po celou dobu v chladu. Čerstvé polévky a čaje k vám mohou dorazit s kratší zbývající trvanlivostí.
                    </p>
                    <label className="flex items-start gap-2 font-medium">
                      <input type="checkbox" name="slovakiaTransitAccepted" required className="mt-1" />
                      <span>Souhlasím s tím, že doručení může trvat až 6 dní.</span>
                    </label>
                  </div>
                )
              ) : null}
              {slovakia ? null : (
              
                <p className="text-xs text-neutral-500">Doručujeme jen v České republice. {SLOVAKIA_ORDER_NOTE}</p>
              )}
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
                } ${selectedPaymentId === method.id ? "border-begina-primary-900" : "border-neutral-200"}`}
              >
                <input
                  type="radio"
                  name="paymentMethodId"
                  value={method.id}
                  disabled={!method.available}
                  checked={selectedPaymentId === method.id}
                  onChange={() => set("paymentMethodId", method.id)}
                  className="mt-1 accent-begina-primary-900"
                />
                <span>
                  <span className="block text-sm font-medium">{method.label}</span>
                  <span className="block text-xs text-neutral-500 mt-0.5">{method.description}</span>
                </span>
              </label>
            ))}
            {fromSlovakia ? (
              <p role="note" className="text-xs text-neutral-600">{SLOVAKIA_CARD_ONLY_NOTE} Částka se platí v Kč, přepočet na eura provede vaše banka.</p>
            ) : null}
          </div>
        </fieldset>

        {boxesMax > 0 && (
          <fieldset>
            <legend className="font-medium mb-3">Balení</legend>
            <div className="border border-neutral-200 rounded-xl p-3.5">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="boxes" className="text-sm font-medium">Zabalit do kartonové krabice</label>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Ubrat krabici"
                    disabled={boxes <= 0}
                    onClick={() => set("boxes", Math.max(0, boxes - 1))}
                    className="w-9 h-9 rounded-lg border border-neutral-300 text-lg leading-none disabled:opacity-40"
                  >
                    −
                  </button>
                  <input
                    id="boxes"
                    name="boxes"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={boxesMax}
                    value={boxes}
                    onChange={(e) => set("boxes", clampBoxes(e.target.value, boxesMax))}
                    className="w-14 h-9 text-center border border-neutral-300 rounded-lg tabular-nums"
                  />
                  <button
                    type="button"
                    aria-label="Přidat krabici"
                    disabled={boxes >= boxesMax}
                    onClick={() => set("boxes", Math.min(boxesMax, boxes + 1))}
                    className="w-9 h-9 rounded-lg border border-neutral-300 text-lg leading-none disabled:opacity-40"
                  >
                    +
                  </button>
                  <span className="text-sm tabular-nums whitespace-nowrap w-20 text-right">+{formatKc(boxesKc)}</span>
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                Balení 3 l běžně posíláme bez vnější krabice. Krabice stojí {formatKc(BOX_PRICE_KC)} za kus — zvolte, kolik
                balení chcete zabalit (nejvýše {boxesMax}). Sirupy 3 l posíláme v krabici vždy, bez příplatku.
              </p>
            </div>
          </fieldset>
        )}

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
          {discountKc > 0 && (
            <li className="py-2 flex justify-between gap-3">
              <span>Sleva ({coupons.preview.applied.filter((a) => a.discountKc > 0).map((a) => couponDisplayName(a)).join(", ")})</span>
              <span className="tabular-nums whitespace-nowrap">−{formatKc(discountKc)}</span>
            </li>
          )}
          {boxes > 0 && (
            <li className="py-2 flex justify-between gap-3">
              <span>
                {boxes}× {BOX_NAME}
              </span>
              <span className="tabular-nums whitespace-nowrap">{formatKc(boxesKc)}</span>
            </li>
          )}
          <li className="py-2 flex justify-between gap-3 text-neutral-600">
            <span>{shipping.label}</span>
            <span className="tabular-nums whitespace-nowrap">
              {coupons.preview.freeShipping && quote.available && quote.priceKc > 0 ? "zdarma (slevový kód)" : formatKc(shippingKc)}
            </span>
          </li>
          <li className="pt-3 flex justify-between gap-3 font-semibold">
            <span>Celkem</span>
            <span className="tabular-nums whitespace-nowrap">{formatKc(subtotalKc - discountKc + shippingKc + boxesKc)}</span>
          </li>
        </ul>
        <p className="mt-2 text-xs text-neutral-600">{VAT_NOTE}</p>

        <CouponBox coupons={coupons} className="mt-4 pt-4 border-t border-neutral-200" />

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
            <a href={href(INFO_PAGES.terms.path)} target="_blank" rel="noopener" className="underline underline-offset-2">
              obchodními podmínkami
            </a>{" "}
            a beru na vědomí{" "}
            <a href={href(INFO_PAGES.privacy.path)} target="_blank" rel="noopener" className="underline underline-offset-2">
              zpracování osobních údajů
            </a>
            .
          </span>
        </label>

        {/* Možnost odmítnout obchodní sdělení už při objednávce (zákon č. 480/2004 Sb., § 7 odst. 3). */}
        <label className="mt-2 flex items-start gap-2 text-xs text-neutral-600">
          <input type="checkbox" name="noPartnerEmails" className="mt-0.5 accent-begina-primary-900" />
          <span>Nepřeji si dostávat e-mailem žádosti o hodnocení nákupu, informace o partnerském programu a nabídky Beginy.</span>
        </label>

        {blockedLines.length > 0 && (
          <p className="mt-4 text-sm text-begina-accent-900 bg-begina-accent-100 rounded-lg px-3 py-2" role="alert">
            {blockedLines.map((line) => line.product.name).join(", ")}: {NOT_ORDERABLE_NOTICE} Upravte prosím košík.
          </p>
        )}

        {state && "error" in state && state.error !== resolvedError && (
          <p className="mt-4 text-sm text-begina-accent-900 bg-begina-accent-100 rounded-lg px-3 py-2" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || blockedLines.length > 0 || !quote.available}
          className="mt-4 w-full bg-begina-primary-900 hover:bg-begina-primary-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg h-11"
        >
          {pending ? "Odesílám…" : "Objednat s povinností platby"}
        </button>
        <ShopLink href="/kosik" className="mt-3 block text-center text-sm text-neutral-600 hover:underline">
          Upravit košík
        </ShopLink>
      </aside>
    </form>
    </>
  );
}

/** Potvrzení v pokladně: stejné bloky jako v e-mailech a v MojeBegina. */
function partiesFromCheckout(value: CheckoutValue) {
  const { billing, delivery } = value;
  return {
    contactName: value.name,
    contactEmail: value.email,
    contactPhone: value.phone,
    recipientName: delivery?.name ?? value.name,
    recipientCompany: delivery?.company ?? null,
    recipientAddress: delivery ? `${delivery.street}, ${delivery.zip} ${delivery.city}` : null,
    recipientPhone: delivery?.phone ?? value.phone,
    shippingMethodCode: value.pricedCart.shipping.id,
    shippingMethodLabel: value.pricedCart.shipping.label,
    billingName: billing.name,
    billingCompany: billing.company?.name ?? null,
    billingIco: billing.company?.ico ?? null,
    billingDic: billing.company?.dic ?? null,
    billingStreet: billing.street,
    billingCity: billing.city,
    billingZip: billing.zip,
    billingCountry: billing.country,
    deliverySameAsBilling: delivery ? delivery.sameAsBilling : null,
  };
}

function PartyCard({ block }: { block: PartyBlock }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 mb-1">{block.title}</p>
      {block.lines.map((line, i) => (
        <p key={i} className="text-begina-primary-900">{line}</p>
      ))}
      {block.note && <p className="text-xs text-neutral-500 mt-1">{block.note}</p>}
    </div>
  );
}

/** Provozovna z karty → doručovací údaje (jiný příjemce než fakturační). */
function locationValues(location: HandoffPrefill["locations"][number], prefill: HandoffPrefill) {
  return {
    deliverySameAsBilling: false,
    recipientName: location.contactName ?? prefill.contact.name ?? "",
    recipientCompany: location.label,
    street: location.street,
    city: location.city,
    zip: location.zip,
    recipientPhone: location.contactPhone ?? prefill.contact.phone ?? "",
  };
}
