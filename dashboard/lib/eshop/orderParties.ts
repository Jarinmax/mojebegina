// Fakturační údaje, doručovací údaje a kontakt zákazníka u objednávky
// (zadání Lucie, 8. 11. 2026). Čisté funkce bez I/O — stejné bloky
// používá interní e-mail, potvrzení zákazníkovi, potvrzení v pokladně
// i detail objednávky v MojeBegina.
//
// Nic se nedoplňuje odhadem: u objednávek z doby, kdy pokladna fakturační
// údaje nezjišťovala, blok výslovně vypíše, co chybí.
import { PICKUP_PLACE } from "./operator";
import { PICKUP_METHOD_ID, ZASILKOVNA_METHOD_ID } from "./shipping";

/** Země doručení — chlazenou přepravou doručujeme jen v ČR. */
export const DELIVERY_COUNTRY = "Česká republika";
/** Země fakturační adresy, které pokladna nabízí. */
export const BILLING_COUNTRIES = ["Česká republika", "Slovensko"] as const;
export type BillingCountry = (typeof BILLING_COUNTRIES)[number];

export const PICKUP_ARRANGEMENT = "Vyzvednutí je možné po předchozí domluvě.";

/** Sloupce objednávky, ze kterých se bloky skládají (orders). */
export type OrderPartiesSource = {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  recipientName: string | null;
  recipientCompany?: string | null;
  recipientAddress: string | null;
  recipientPhone: string | null;
  shippingMethodCode: string | null;
  shippingMethodLabel: string | null;
  billingName?: string | null;
  billingCompany?: string | null;
  billingIco?: string | null;
  billingDic?: string | null;
  billingStreet?: string | null;
  billingCity?: string | null;
  billingZip?: string | null;
  billingCountry?: string | null;
  deliverySameAsBilling?: boolean | null;
};

export type PartyBlock = {
  title: string;
  /** řádky jako na obálce (jméno, firma, ulice, PSČ a město, země…) */
  lines: string[];
  /** co u objednávky chybí — vypisuje se doslova, nic se nedohaduje */
  missing: string[];
  /** doplňující věta (např. „Shodné s fakturačními údaji.“) */
  note?: string;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** „149 00“ — PSČ s mezerou (uložené bývá i bez ní). */
export function formatZip(zip: string): string {
  const digits = zip.replace(/\s/g, "");
  return /^\d{5}$/.test(digits) ? `${digits.slice(0, 3)} ${digits.slice(3)}` : zip.trim();
}

/** „Matúškova 831/1, 149 00 Praha 4“ (formát pokladny) → [ulice, „PSČ město“]. */
export function splitAddressLine(raw: string): string[] {
  const comma = raw.lastIndexOf(",");
  if (comma < 0) return [raw.trim()];
  return [raw.slice(0, comma).trim(), raw.slice(comma + 1).trim()].filter(Boolean);
}

export function isPickup(order: Pick<OrderPartiesSource, "shippingMethodCode">): boolean {
  return order.shippingMethodCode === PICKUP_METHOD_ID;
}

/** Má objednávka fakturační údaje z pokladny (od 8. 11. 2026)? */
export function hasBillingDetails(order: OrderPartiesSource): boolean {
  return clean(order.billingStreet) !== null;
}

export function billingBlock(order: OrderPartiesSource): PartyBlock {
  const title = "Fakturační údaje";
  if (hasBillingDetails(order)) {
    const lines: string[] = [];
    const company = clean(order.billingCompany);
    const name = clean(order.billingName) ?? clean(order.contactName);
    if (company) lines.push(company);
    // u živnostníka je „firma“ jeho jméno — kontaktní osobu pak neopakujeme
    if (name && name !== company) lines.push(company ? `Kontaktní osoba: ${name}` : name);
    lines.push(clean(order.billingStreet)!);
    const zip = clean(order.billingZip);
    const city = clean(order.billingCity);
    lines.push([zip ? formatZip(zip) : null, city].filter(Boolean).join(" "));
    lines.push(clean(order.billingCountry) ?? DELIVERY_COUNTRY);
    const ico = clean(order.billingIco);
    const dic = clean(order.billingDic);
    if (ico) lines.push(`IČO: ${ico}`);
    if (dic) lines.push(`DIČ: ${dic}`);
    return {
      title,
      lines,
      missing: [],
      note: company ? "Nákup na firmu — fakturu vystavit na firmu." : "Nákup soukromé osoby.",
    };
  }
  // Starší objednávka: pokladna se na fakturační údaje neptala.
  const name = clean(order.contactName);
  const missing = ["fakturační adresa (pokladna ji u této objednávky nezjišťovala)", "nákup na firmu (název, IČO, DIČ) se nezjišťoval"];
  if (!name) missing.unshift("jméno a příjmení");
  return { title, lines: name ? [name] : [], missing };
}

export function deliveryBlock(order: OrderPartiesSource): PartyBlock {
  const title = "Doručovací údaje";
  if (isPickup(order)) {
    return {
      title,
      lines: [`Osobní odběr – ${PICKUP_PLACE.name}`, `${PICKUP_PLACE.address}`, `(${PICKUP_PLACE.area})`, PICKUP_ARRANGEMENT],
      missing: [],
    };
  }
  const lines: string[] = [];
  const missing: string[] = [];
  const name = clean(order.recipientName);
  const company = clean(order.recipientCompany);
  const address = clean(order.recipientAddress);
  const phone = clean(order.recipientPhone);
  if (name) lines.push(name);
  else missing.push("jméno příjemce");
  if (company) lines.push(company);
  if (address) {
    lines.push(...splitAddressLine(address), DELIVERY_COUNTRY);
  } else missing.push("doručovací adresa");
  if (phone) lines.push(`Tel.: ${phone}`);
  else missing.push("telefon pro doručení");
  const note =
    order.shippingMethodCode === ZASILKOVNA_METHOD_ID
      ? "Zásilkovna — zásilka se podává na uvedené výdejní místo."
      : order.deliverySameAsBilling === true
      ? "Shodné s fakturačními údaji."
      : order.deliverySameAsBilling === false
        ? "Jiný příjemce / jiná adresa než fakturační."
        : undefined;
  return { title, lines, missing, note };
}

export function contactBlock(order: OrderPartiesSource): PartyBlock {
  const lines: string[] = [];
  const missing: string[] = [];
  const email = clean(order.contactEmail);
  const phone = clean(order.contactPhone);
  if (email) lines.push(`E-mail: ${email}`);
  else missing.push("e-mail");
  if (phone) lines.push(`Telefon: ${phone}`);
  else missing.push("telefon");
  return { title: "Kontakt zákazníka", lines, missing };
}

/** Způsob dopravy samostatně (bez adresy). */
export function shippingMethodText(order: Pick<OrderPartiesSource, "shippingMethodCode" | "shippingMethodLabel">): string {
  if (isPickup(order)) return `Osobní odběr – ${PICKUP_PLACE.name}`;
  return clean(order.shippingMethodLabel) ?? "Doprava";
}

/** Všechny tři bloky v pořadí pro interní e-mail a detail objednávky. */
export function orderPartyBlocks(order: OrderPartiesSource): PartyBlock[] {
  return [billingBlock(order), deliveryBlock(order), contactBlock(order)];
}

/** Blok jako prostý text (textová část e-mailu). */
export function partyBlockText(block: PartyBlock): string {
  const rows = [...block.lines];
  if (block.note) rows.push(block.note);
  if (block.missing.length > 0) rows.push(`CHYBÍ: ${block.missing.join("; ")}`);
  return `${block.title}\n${rows.length > 0 ? rows.join("\n") : "—"}`;
}
