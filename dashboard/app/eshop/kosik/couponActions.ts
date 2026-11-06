"use server";

// Slevové kódy v košíku a v pokladně (zadání Lucie, 6. 11. 2026): ověření
// a výpočet slevy na serveru, aby prohlížeč nemohl slevu podvrhnout. Při
// odeslání objednávky se kódy ověří znovu (pokladna/actions.ts).
import { db } from "@/lib/db/client";
import { parseStoredCart } from "@/lib/eshop/cart";
import { getCatalogIndex } from "@/lib/eshop/catalogServer";
import { evaluateCoupons, MAX_COUPONS, needsEmailCheck, parseCouponCodes } from "@/lib/eshop/coupons";
import { loadCouponContext } from "@/lib/eshop/couponsServer";
import { priceCart } from "@/lib/eshop/pricing";
import { isEshopPublic } from "@/lib/eshop/storeMode";

export type CouponLine = { code: string; discountKc: number; freeShipping: boolean };
export type CouponPreview = {
  /** platné kódy se slevou (pořadí jako zadal zákazník) */
  applied: CouponLine[];
  /** zamítnuté kódy s vysvětlením */
  rejected: { code: string; error: string }[];
  discountKc: number;
  freeShipping: boolean;
  /** některý platný kód má omezení na e-mail / zákazníka — ověří se v pokladně */
  emailCheckPending: boolean;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function previewCouponsAction(input: { cart: string; codes: string[]; email?: string }): Promise<CouponPreview> {
  const empty: CouponPreview = { applied: [], rejected: [], discountKc: 0, freeShipping: false, emailCheckPending: false };
  if (!isEshopPublic()) return empty;
  let codes = parseCouponCodes(JSON.stringify(input.codes ?? []));
  if (codes.length === 0) return empty;
  if (codes.length > MAX_COUPONS) codes = codes.slice(0, MAX_COUPONS);

  const index = await getCatalogIndex();
  // Doprava pro slevu nehraje roli (sleva je ze zboží) — osobní odběr nikdy neselže.
  const priced = priceCart(parseStoredCart(input.cart), "osobni-odber", index);
  if (!priced.ok) return { ...empty, rejected: codes.map((code) => ({ code, error: priced.error })) };

  const email = input.email && EMAIL_PATTERN.test(input.email.trim()) ? input.email.trim() : null;
  const ctx = await loadCouponContext(db, codes);
  const rejected: CouponPreview["rejected"] = [];
  let remaining = [...codes];
  // Kód, který neprojde, se vyřadí a zbytek se spočítá znovu (jako WooCommerce).
  for (let attempt = 0; attempt <= codes.length; attempt += 1) {
    const result = evaluateCoupons(remaining, {
      lines: priced.value.lines,
      subtotalKc: priced.value.subtotalKc,
      index,
      coupons: ctx.coupons,
      usage: ctx.usage,
      email,
      now: ctx.now,
    });
    if (result.ok) {
      return {
        applied: result.applied,
        rejected,
        discountKc: Math.min(result.discountKc, priced.value.subtotalKc),
        freeShipping: result.freeShipping,
        emailCheckPending: email === null && result.applied.some((a) => needsEmailCheck(ctx.coupons.get(a.code))),
      };
    }
    rejected.push({ code: result.code, error: result.error });
    remaining = remaining.filter((code) => code !== result.code);
  }
  return { ...empty, rejected };
}
