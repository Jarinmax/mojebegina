import { Truck } from "lucide-react";
import { activeShippingNotice } from "@/lib/eshop/shippingNotice";

/** Pruh o termínu odeslání (lib/eshop/shippingNotice.ts); po termínu se nezobrazí. */
export default function ShippingNoticeBanner({ now }: { now?: Date }) {
  const text = activeShippingNotice(now);
  if (!text) return null;
  return (
    <div className="bg-begina-primary-900 text-white text-sm print:hidden" role="status">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-center">
        <Truck className="w-4 h-4 shrink-0" aria-hidden />
        <p className="font-medium">{text}</p>
      </div>
    </div>
  );
}
