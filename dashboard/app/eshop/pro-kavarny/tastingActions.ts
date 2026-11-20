"use server";

// Ochutnávka do provozu — ověření IČO před vložením do košíku (20. 11. 2026):
// formát a kontrolní číslice, jedna ochutnávka na IČO, údaje z ARES.
import { db } from "@/lib/db/client";
import { isEshopPublic } from "@/lib/eshop/storeMode";
import { normalizeIco } from "@/lib/eshop/checkout";
import { lookupAres } from "@/lib/eshop/ares";
import { CAFE_TASTING_ALREADY } from "@/lib/eshop/cafeTasting";
import { cafeTastingOrdered, cafeTastingVisible } from "@/lib/eshop/cafeTastingServer";

export type TastingIcoResult =
  | { ok: true; ico: string; company: { name: string; dic: string | null; street: string; city: string; zip: string } | null }
  | { ok: false; error: string; already?: boolean };

export async function checkTastingIcoAction(rawIco: string, rawVenue: string): Promise<TastingIcoResult> {
  if (!isEshopPublic() || !(await cafeTastingVisible())) return { ok: false, error: "Ochutnávku teď nejde objednat." };
  if (!rawVenue.trim()) return { ok: false, error: "Vyplňte prosím název podniku." };
  const ico = normalizeIco(rawIco, "Česká republika");
  if (!ico) return { ok: false, error: "Zadejte platné IČO (8 číslic)." };
  if ((await cafeTastingOrdered(db, ico)) === true) return { ok: false, error: CAFE_TASTING_ALREADY, already: true };
  const ares = await lookupAres(ico);
  if (!ares.ok && ares.reason === "not_found") return { ok: false, error: "Toto IČO jsme v registru ARES nenašli. Zkontrolujte ho prosím." };
  // ARES nedostupný: pokračuje se, údaje firmy se vyplní v pokladně ručně.
  return { ok: true, ico, company: ares.ok ? { name: ares.company.name, dic: ares.company.dic, street: ares.company.street, city: ares.company.city, zip: ares.company.zip } : null };
}
