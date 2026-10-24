"use client";

import { useEffect } from "react";
import { forgetPendingOrder } from "@/components/eshop/usePendingOrder";

/** Zaplacená / zrušená objednávka: košík a pokladna už k ní platbu nenabízejí. */
export default function ForgetPendingOrder({ orderId }: { orderId: string }) {
  useEffect(() => forgetPendingOrder(orderId), [orderId]);
  return null;
}
