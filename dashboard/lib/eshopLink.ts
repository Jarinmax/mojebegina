// Kam vedou tlačítka „E-shop“ z MojeBegina (horní lišty, Řízení firmy,
// zákaznická karta). JEDINÉ místo, kde se cíl nastavuje.
//
// Dnes e-shop běží ve stejné aplikaci na /eshop. Až poběží na begina.cz,
// stačí ve Vercelu nastavit NEXT_PUBLIC_ESHOP_URL=https://begina.cz (nebo
// změnit DEFAULT_ESHOP_URL níže) — všechna tlačítka se přepnou najednou.

export const DEFAULT_ESHOP_URL = "/eshop";

export type EshopLink = { href: string; external: boolean };

/** Povolená je jen interní cesta "/…" nebo https adresa; cokoli jiného → /eshop. */
export function resolveEshopLink(configured: string | undefined): EshopLink {
  const value = configured?.trim() ?? "";
  if (/^\/(?!\/)[^\s]*$/.test(value)) {
    return { href: value, external: false };
  }
  if (/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(value)) {
    return { href: value, external: true };
  }
  return { href: DEFAULT_ESHOP_URL, external: false };
}

// NEXT_PUBLIC_* se dosadí při buildu, takže funguje na serveru i v prohlížeči.
export const eshopLink: EshopLink = resolveEshopLink(process.env.NEXT_PUBLIC_ESHOP_URL);
