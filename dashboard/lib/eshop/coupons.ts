// E-shop — slevové kupóny (zadání Lucie, 6. 11. 2026). Čistá logika bez DB:
// pravidla převzatá z WooCommerce, aby kupóny rozeslané ze starého e-shopu
// platily beze změny hodnot, platnosti, omezení i pravidel kombinování.
//
//   partner        — osobní kód partnerského programu: procento podle úrovně
//                    partnera (uhrazené nákupy zboží v minulém měsíci,
//                    mock/partnerProgram.ts), nad 20 000 Kč individuálně
//   percent        — procento z ceny způsobilého zboží
//   fixed_cart     — pevná částka z košíku (rozpočítaná na způsobilé zboží)
//   fixed_product  — pevná částka z každého způsobilého kusu
//   free_shipping  — navíc doprava zdarma
//
// Pořadí kontrol a podmínky jako WC_Discounts::is_coupon_valid: existence,
// platnost, limit použití, minimální / maximální útrata (mezisoučet zboží
// bez dopravy), způsobilé zboží, „použít samostatně“, omezení na e-mail
// a limit na zákazníka (oba až s e-mailem z pokladny).
// Více kupónů se počítá z původní ceny (WooCommerce bez „sequential
// discounts“), sleva nikdy nepřesáhne cenu zboží. Částky v celých Kč.
import { formatKc } from "@/lib/format";
import type { CatalogIndex } from "./catalogIndex";
import type { PricedLine } from "./pricing";
import { partnerTiers, type PartnerTier } from "@/mock/partnerProgram";

export type CouponDiscountType = "partner" | "percent" | "fixed_cart" | "fixed_product";

export type Coupon = {
  code: string;
  discountType: CouponDiscountType;
  amount: number;
  freeShipping: boolean;
  expiresAt: Date | null;
  minimumAmountKc: number | null;
  maximumAmountKc: number | null;
  individualUse: boolean;
  productSlugs: string[];
  excludedProductSlugs: string[];
  categorySlugs: string[];
  excludedCategorySlugs: string[];
  emailRestrictions: string[];
  usageLimit: number | null;
  usageLimitPerUser: number | null;
  limitUsageToXItems: number | null;
  /** jen „partner“: uhrazené nákupy zboží partnera v minulém kalendářním měsíci (Kč) */
  partnerLastMonthKc?: number | null;
  /** jen „partner“: název partnera (do vysvětlení) */
  partnerName?: string | null;
};

/** Úroveň partnerského programu pro obrat minulého měsíce (stejná tabulka jako Moje Begina). */
export function partnerTierFor(lastMonthKc: number, tiers: PartnerTier[] = partnerTiers): PartnerTier {
  const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount);
  return sorted.reduce((acc, tier) => (lastMonthKc >= tier.minAmount ? tier : acc), sorted[0]);
}

/**
 * Procento slevy osobního kódu partnera, nebo vysvětlení, proč sleva zatím
 * není. Individuální úroveň (nad 20 000 Kč) = `amount` kupónu.
 */
export function partnerPercent(coupon: Coupon): { ok: true; percent: number } | { ok: false; error: string } {
  const lastMonth = coupon.partnerLastMonthKc ?? 0;
  const tier = partnerTierFor(lastMonth);
  const code = `„${coupon.code.toUpperCase()}“`;
  if (tier.discountPercent === null) {
    return coupon.amount > 0
      ? { ok: true, percent: coupon.amount }
      : { ok: false, error: `Partnerský kód ${code} má individuální podmínky, které zatím nejsou nastavené. Ozvěte se nám prosím na info@begina.cz.` };
  }
  if (tier.discountPercent === 0 && coupon.code === PARTNER_CODE) {
    // e-mail není ověřený — bez částek
    return {
      ok: false,
      error: "Na partnerskou slevu tento měsíc nárok nevznikl. Sleva se počítá z uhrazených nákupů zboží (bez dopravy) za minulý kalendářní měsíc, 3 % od 5 001 Kč.",
    };
  }
  if (tier.discountPercent === 0) {
    const first = [...partnerTiers].sort((a, b) => a.minAmount - b.minAmount).find((t) => (t.discountPercent ?? 0) > 0);
    return {
      ok: false,
      error: `Partnerský kód ${code} tento měsíc slevu nedává — za minulý měsíc evidujeme uhrazené nákupy zboží za ${formatKc(lastMonth)}${
        first ? ` a sleva ${first.discountPercent} % začíná od ${formatKc(first.minAmount)}` : ""
      }.`,
    };
  }
  return { ok: true, percent: tier.discountPercent };
}

/** Kolikrát byl kupón použit (WooCommerce + nový e-shop, bez zrušených objednávek). */
export type CouponUsage = { total: number; byEmail: Map<string, number> };

export type AppliedCoupon = {
  code: string;
  discountKc: number;
  freeShipping: boolean;
  /** jen partnerský kód: použité procento úrovně */
  partnerPercent?: number;
};

export type CouponResult =
  | { ok: true; applied: AppliedCoupon[]; discountKc: number; freeShipping: boolean }
  | { ok: false; code: string; error: string };

export const MAX_COUPONS = 5;

/**
 * Automatická partnerská sleva (zadání 6. 11. 2026): vyhrazený „kód“, který
 * e-shop nabídne sám, jakmile podle e-mailu pozná zákazníka s partnerskou
 * úrovní za minulý měsíc. Nikdo ho nerozesílá ani nezakládá.
 */
export const PARTNER_CODE = "partner";

/** Jak se kód zobrazí zákazníkovi (automatická sleva slovy, jinak kód velkými písmeny). */
export function couponDisplayName(applied: { code: string; partnerPercent?: number }): string {
  if (applied.code === PARTNER_CODE) {
    return applied.partnerPercent ? `Partnerská sleva ${applied.partnerPercent} %` : "Partnerská sleva";
  }
  return applied.code.toUpperCase();
}
const MAX_CODE_LENGTH = 64;

/** Kód tak, jak ho porovnává WooCommerce: bez mezer okolo, malými písmeny. */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Seznam kódů z formuláře / localStorage (nedůvěryhodný vstup). */
export function parseCouponCodes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const codes: string[] = [];
  for (const entry of data) {
    if (typeof entry !== "string") continue;
    const code = normalizeCouponCode(entry);
    if (code && code.length <= MAX_CODE_LENGTH && !codes.includes(code)) codes.push(code);
    if (codes.length >= MAX_COUPONS) break;
  }
  return codes;
}

/** Shoda e-mailu s omezením kupónu („*“ = libovolné znaky, bez ohledu na velikost písmen). */
export function emailAllowed(email: string, restrictions: string[]): boolean {
  if (restrictions.length === 0) return true;
  const value = email.trim().toLowerCase();
  return restrictions.some((pattern) => {
    const re = new RegExp(
      `^${pattern
        .trim()
        .toLowerCase()
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")}$`
    );
    return re.test(value);
  });
}

type Unit = { lineIndex: number; priceKc: number };

function eligibleLineIndexes(coupon: Coupon, lines: PricedLine[], index: CatalogIndex): number[] {
  return lines.flatMap((line, i) => {
    const found = index.getVariant(line.sku);
    if (!found) return [];
    const { product } = found;
    const included =
      (coupon.productSlugs.length === 0 && coupon.categorySlugs.length === 0) ||
      coupon.productSlugs.includes(product.slug) ||
      coupon.categorySlugs.includes(product.category);
    const excluded = coupon.excludedProductSlugs.includes(product.slug) || coupon.excludedCategorySlugs.includes(product.category);
    return included && !excluded ? [i] : [];
  });
}

const quote = (code: string) => `„${code.toUpperCase()}“`;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" }).format(date);
}

/** Chyba kupónu, který nejde použít bez ohledu na košík (null = zatím v pořádku). */
function staticError(code: string, coupon: Coupon | undefined, usage: CouponUsage | undefined, now: Date): string | null {
  if (!coupon) return `Slevový kód ${quote(code)} neexistuje. Zkontrolujte prosím, zda je opsaný správně.`;
  if (coupon.expiresAt && now.getTime() > coupon.expiresAt.getTime()) {
    return `Platnost slevového kódu ${quote(code)} skončila ${formatDate(coupon.expiresAt)}.`;
  }
  if (coupon.usageLimit !== null && (usage?.total ?? 0) >= coupon.usageLimit) {
    return `Slevový kód ${quote(code)} už byl vyčerpán.`;
  }
  return null;
}

/**
 * Uplatní kupóny na ocenění košík. `email` = null v košíku (omezení na
 * e-mail a limit na zákazníka se ověří až v pokladně), jinak e-mail
 * z pokladny. Vrací první chybu — zákazník ví, který kód a proč neprošel.
 */
export function evaluateCoupons(
  codes: string[],
  input: {
    lines: PricedLine[];
    subtotalKc: number;
    index: CatalogIndex;
    coupons: Map<string, Coupon>;
    usage: Map<string, CouponUsage>;
    email: string | null;
    now: Date;
  }
): CouponResult {
  const { lines, subtotalKc, index, coupons, usage, email, now } = input;
  if (codes.length === 0) return { ok: true, applied: [], discountKc: 0, freeShipping: false };

  // „Použít samostatně“: kupón nejde kombinovat s žádným jiným.
  if (codes.length > 1) {
    const individual = codes.find((code) => coupons.get(code)?.individualUse);
    if (individual) {
      return { ok: false, code: individual, error: `Slevový kód ${quote(individual)} nelze kombinovat s jiným slevovým kódem.` };
    }
  }

  // zbývající cena každého kusu (sleva nesmí jít pod nulu)
  const remaining: Unit[] = lines.flatMap((line, lineIndex) =>
    Array.from({ length: line.quantity }, () => ({ lineIndex, priceKc: line.unitPriceKc }))
  );

  const applied: AppliedCoupon[] = [];
  for (const code of codes) {
    const coupon = coupons.get(code);
    if (code === PARTNER_CODE && !coupon) {
      return {
        ok: false,
        code,
        error:
          email === null
            ? "Partnerskou slevu ověříme podle e-mailu — zadejte ho prosím v pokladně."
            : "K tomuto e-mailu nenacházíme partnerskou úroveň za minulý měsíc, proto partnerská sleva neplatí.",
      };
    }
    const failure = staticError(code, coupon, usage.get(code), now);
    if (failure || !coupon) return { ok: false, code, error: failure ?? "" };

    if (coupon.minimumAmountKc !== null && subtotalKc < coupon.minimumAmountKc) {
      return {
        ok: false,
        code,
        error: `Slevový kód ${quote(code)} platí pro nákup zboží od ${formatKc(coupon.minimumAmountKc)} (bez dopravy). Do této částky vám chybí ${formatKc(coupon.minimumAmountKc - subtotalKc)}.`,
      };
    }
    if (coupon.maximumAmountKc !== null && subtotalKc > coupon.maximumAmountKc) {
      return {
        ok: false,
        code,
        error: `Slevový kód ${quote(code)} platí jen pro nákup zboží nejvýše za ${formatKc(coupon.maximumAmountKc)} (bez dopravy).`,
      };
    }

    const eligible = new Set(eligibleLineIndexes(coupon, lines, index));
    const restricted =
      coupon.productSlugs.length + coupon.categorySlugs.length + coupon.excludedProductSlugs.length + coupon.excludedCategorySlugs.length > 0;
    if (eligible.size === 0 && (restricted || coupon.discountType !== "fixed_cart")) {
      return { ok: false, code, error: `Slevový kód ${quote(code)} se nevztahuje na žádné zboží v košíku.` };
    }

    if (email !== null) {
      if (!emailAllowed(email, coupon.emailRestrictions)) {
        return {
          ok: false,
          code,
          error: `Slevový kód ${quote(code)} je určený pro jiný e-mail. Zadejte prosím e-mail, na který vám kód přišel.`,
        };
      }
      const used = usage.get(code)?.byEmail.get(email.trim().toLowerCase()) ?? 0;
      if (coupon.usageLimitPerUser !== null && used >= coupon.usageLimitPerUser) {
        return { ok: false, code, error: `Slevový kód ${quote(code)} jste už využili v dřívější objednávce.` };
      }
    }

    // kusy, na které se sleva počítá (WooCommerce: od nejdražšího, nejvýše X kusů)
    let units = remaining.filter((unit) => eligible.has(unit.lineIndex));
    units.sort((a, b) => b.priceKc - a.priceKc);
    if (coupon.limitUsageToXItems !== null && coupon.discountType !== "fixed_cart") {
      units = units.slice(0, coupon.limitUsageToXItems);
    }

    let percent = coupon.amount;
    if (coupon.discountType === "partner") {
      const tier = partnerPercent(coupon);
      if (!tier.ok) return { ok: false, code, error: tier.error };
      percent = tier.percent;
    }

    let discount = 0;
    if (coupon.discountType === "percent" || coupon.discountType === "partner") {
      for (const unit of units) {
        const cut = Math.min(unit.priceKc, Math.round((unit.priceKc * percent) / 100));
        unit.priceKc -= cut;
        discount += cut;
      }
    } else if (coupon.discountType === "fixed_product") {
      for (const unit of units) {
        const cut = Math.min(unit.priceKc, Math.round(coupon.amount));
        unit.priceKc -= cut;
        discount += cut;
      }
    } else {
      // pevná částka z košíku, rozpočítaná podle ceny kusů
      const base = units.reduce((sum, unit) => sum + unit.priceKc, 0);
      const total = Math.min(Math.round(coupon.amount), base);
      let left = total;
      for (const unit of units) {
        const share = Math.min(unit.priceKc, left, Math.floor((unit.priceKc * total) / Math.max(base, 1)));
        unit.priceKc -= share;
        left -= share;
      }
      // zbytek po zaokrouhlení po korunách na kusy, které ještě mají cenu
      for (const unit of units) {
        if (left === 0) break;
        const extra = Math.min(unit.priceKc, left);
        unit.priceKc -= extra;
        left -= extra;
      }
      discount = total - left;
    }
    applied.push({
      code,
      discountKc: discount,
      freeShipping: coupon.freeShipping,
      ...(coupon.discountType === "partner" ? { partnerPercent: percent } : {}),
    });
  }

  return {
    ok: true,
    applied,
    discountKc: applied.reduce((sum, a) => sum + a.discountKc, 0),
    freeShipping: applied.some((a) => a.freeShipping),
  };
}

/** Kupón, u kterého se omezení na e-mail nebo zákazníka ověří až v pokladně. */
export function needsEmailCheck(coupon: Coupon | undefined): boolean {
  return !!coupon && (coupon.emailRestrictions.length > 0 || coupon.usageLimitPerUser !== null);
}
