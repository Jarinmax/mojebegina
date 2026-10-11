"use client";

// Odkaz na soubor e-shopu (PDF) — obyčejný <a>, ne next/link (route handler
// se nenavštěvuje klientskou navigací). Základ cesty podle domény jako ShopLink.
import type { AnchorHTMLAttributes } from "react";
import { useEshopHref } from "./EshopBase";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

export default function ShopFileLink({ href, ...rest }: Props) {
  const toHref = useEshopHref();
  return <a href={toHref(href)} {...rest} />;
}
