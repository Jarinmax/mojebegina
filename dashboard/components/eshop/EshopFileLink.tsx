"use client";

// Odkaz na SOUBOR e-shopu (např. PDF obchodních podmínek): obyčejné <a>,
// ne next/link — ten by soubor zkusil načíst jako stránku. Cesta je cesta
// e-shopu BEZ /eshop, základ se doplní podle domény (jako ShopLink).
import type { ComponentProps } from "react";
import { useEshopHref } from "./EshopBase";

type Props = Omit<ComponentProps<"a">, "href"> & { href: string };

export default function EshopFileLink({ href, ...rest }: Props) {
  const toHref = useEshopHref();
  return <a href={toHref(href)} {...rest} />;
}
