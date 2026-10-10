"use client";

// next/link pro stránky e-shopu: href je cesta e-shopu BEZ /eshop
// („/kosik", „/produkt/kulajda") a základ se doplní podle domény
// (begina.cz → /kosik, moje.begina.cz → /eshop/kosik). Použitelné
// i ze serverových komponent.
import Link from "next/link";
import type { ComponentProps } from "react";
import { useEshopHref } from "./EshopBase";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export default function ShopLink({ href, ...rest }: Props) {
  const toHref = useEshopHref();
  return <Link href={toHref(href)} {...rest} />;
}
