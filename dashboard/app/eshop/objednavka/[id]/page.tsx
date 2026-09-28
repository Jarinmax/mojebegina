import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, CircleAlert, Clock } from "lucide-react";
import { db } from "@/lib/db/client";
import { formatKc } from "@/lib/format";
import { parseOrderToken } from "@/lib/eshop/orderWrite";
import { isCardPaymentAvailable } from "@/lib/eshop/stripe/config";
import { canPayByCard, loadPaymentOrder } from "@/lib/eshop/stripe/payment";
import PayAgainButton from "./PayAgainButton";

// ESHOP 1.0 — stav e-shopové objednávky pro zákazníka (návrat ze Stripe).
// Adresa obsahuje náhodné id objednávky; stránka ukazuje jen položky,
// částku a stav platby — žádné jméno, adresu ani e-mail.
export const metadata: Metadata = { title: "Stav objednávky", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrderStatusPage(props: PageProps<"/eshop/objednavka/[id]">) {
  const { id } = await props.params;
  const { platba } = await props.searchParams;
  const orderId = parseOrderToken(id);
  const order = orderId ? await loadPaymentOrder(db, orderId) : null;
  if (!order || order.channel !== "eshop") {
    notFound();
  }

  const paid = order.paymentStatus === "paid";
  const canPay = isCardPaymentAvailable() && canPayByCard(order).ok;
  const reference = order.id.slice(0, 8);

  let banner: { icon: typeof CircleCheck; title: string; text: string };
  if (paid) {
    banner = { icon: CircleCheck, title: "Zaplaceno — děkujeme", text: "Platbu jsme přijali, objednávku připravujeme." };
  } else if (platba === "ok") {
    banner = {
      icon: Clock,
      title: "Čekáme na potvrzení platby",
      text: "Platební brána nám potvrzení posílá zvlášť, obvykle do několika sekund. Obnovte prosím stránku.",
    };
  } else if (platba === "zrusena") {
    banner = { icon: CircleAlert, title: "Platba nebyla dokončena", text: "Objednávka je uložená, ale zatím nezaplacená." };
  } else if (platba === "chyba") {
    banner = {
      icon: CircleAlert,
      title: "Platební bránu se nepodařilo otevřít",
      text: "Objednávka je uložená, ale zatím nezaplacená. Zkuste zaplatit znovu.",
    };
  } else {
    banner = { icon: Clock, title: "Objednávka čeká na zaplacení", text: "Objednávka je uložená, ale zatím nezaplacená." };
  }
  const Icon = banner.icon;

  return (
    <div className="max-w-xl mx-auto px-4 py-8 sm:py-10">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-6 h-6 text-begina-primary-900" />
        <h1 className="text-2xl font-semibold tracking-tight">{banner.title}</h1>
      </div>
      <p className="text-sm text-neutral-600 mb-1">{banner.text}</p>
      <p className="text-xs text-neutral-500 mb-6">
        Reference objednávky: <span className="font-mono">{reference}</span>
      </p>

      <div className="border border-neutral-200 rounded-2xl p-5 text-sm mb-6">
        <ul className="divide-y divide-neutral-100">
          {order.items.map((item) => (
            <li key={item.name} className="py-2 flex justify-between gap-3">
              <span>
                {item.quantity}× {item.name}
              </span>
              <span className="tabular-nums whitespace-nowrap">{formatKc(item.unitPriceKc * item.quantity)}</span>
            </li>
          ))}
          {order.shippingKc > 0 && (
            <li className="py-2 flex justify-between gap-3">
              <span>{order.shippingMethodLabel ?? "Doprava"}</span>
              <span className="tabular-nums whitespace-nowrap">{formatKc(order.shippingKc)}</span>
            </li>
          )}
          <li className="pt-3 flex justify-between gap-3 font-semibold">
            <span>Celkem</span>
            <span className="tabular-nums whitespace-nowrap">{formatKc(order.totalKc)}</span>
          </li>
        </ul>
      </div>

      {!paid && canPay && (
        <div className="mb-6">
          <PayAgainButton orderId={order.id} label={platba === "ok" ? "Zaplatit kartou" : "Zaplatit znovu kartou"} />
        </div>
      )}
      {!paid && platba === "ok" && (
        <Link href={`/eshop/objednavka/${order.id}?platba=ok`} className="text-sm underline underline-offset-2 mr-4">
          Obnovit stav
        </Link>
      )}
      <Link href="/eshop" className="text-sm font-medium underline underline-offset-2">
        Zpět do e-shopu
      </Link>
    </div>
  );
}
