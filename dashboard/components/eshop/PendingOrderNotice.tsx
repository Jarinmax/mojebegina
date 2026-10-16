"use client";

// „Objednávka č. … čeká na zaplacení“ v košíku a pokladně. Zobrazí se jen
// když server potvrdí, že rozpracovaná objednávka jde zaplatit kartou;
// zaplacená / zrušená se zapomene. Kontrola proběhne znovu i při návratu
// tlačítkem Zpět (stránka obnovená z mezipaměti prohlížeče — pageshow).

import { useEffect, useState } from "react";
import ShopLink from "./ShopLink";
import { CircleAlert } from "lucide-react";
import PayAgainButton from "@/app/eshop/objednavka/[id]/PayAgainButton";
import { pendingOrderStatusAction } from "@/app/eshop/objednavka/[id]/actions";
import { forgetPendingOrder, usePendingOrder } from "./usePendingOrder";

export const PAY_PENDING_LABEL = "Zaplatit objednávku";

export default function PendingOrderNotice() {
  const pending = usePendingOrder();
  const orderId = pending?.orderId ?? null;
  const [payable, setPayable] = useState<{ orderId: string; orderNumber: number | null } | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    const check = () => {
      pendingOrderStatusAction(orderId)
        .then((status) => {
          if (!active || !status) return;
          if (status.state === "payable") {
            setPayable({ orderId, orderNumber: status.orderNumber });
          } else {
            setPayable(null);
            forgetPendingOrder(orderId);
          }
        })
        .catch(() => {
          // výpadek sítě — odkaz zůstává, zkusí se při další návštěvě
        });
    };
    check();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) check();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      active = false;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [orderId]);

  if (!payable || payable.orderId !== orderId) return null;
  const reference = payable.orderNumber !== null ? `č. ${payable.orderNumber}` : "";

  return (
    <div
      role="status"
      data-pending-order={payable.orderId}
      className="border border-begina-accent-300 bg-begina-accent-100 rounded-2xl p-4 mb-6 text-sm"
    >
      <div className="flex items-start gap-2 mb-3">
        <CircleAlert className="w-5 h-5 shrink-0 text-begina-primary-900" />
        <p className="text-begina-primary-900">
          Objednávka {reference} je uložená, ale zatím nezaplacená. Nemusíte objednávat znovu — stačí ji zaplatit.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <PayAgainButton orderId={payable.orderId} label={PAY_PENDING_LABEL} />
        <ShopLink href={`/objednavka/${payable.orderId}`} className="underline underline-offset-2">
          Zobrazit objednávku
        </ShopLink>
      </div>
    </div>
  );
}
