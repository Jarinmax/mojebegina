// Stránka „Pro kavárny a bistra“ (begina.cz/pro-kavarny) — zadání Lucie
// 18. 11. 2026: hlavní zákazníci Beginy jsou kavárny a bistra. Texty a
// kontrola formuláře „Chci ochutnávku do provozu“ (čisté funkce, testy
// lib/eshop/__tests__/cafePage.test.ts).
//
// Pravidla: vykání, žádná zdravotní tvrzení, žádné velkoobchodní ceny
// (ceny porcí jsou z běžného e-shopu), alkoholické nápoje se nepropagují jako rostlinné.
// Trvanlivost po otevření podle e-shopu: polévky a čaje 14 dní, sirupy
// 3 měsíce (ovocné nápoje 5 dní — proto se u nich výdrž neuvádí).

export const CAFE_PATH = "/pro-kavarny";
// Od 20. 11. 2026 (Lucie) plný název a první, zvýrazněná položka menu.
export const CAFE_MENU_LABEL = "Pro kavárny a bistra";
export const CAFE_TITLE = "Polévky a nápoje pro kavárny a bistra";
// „nic nevyhodíte“ pryč (Lucie 18. 11. 2026): obal se vyhazuje, myšleno bylo jen jídlo
// „kolik prodáte“ → „objednanou porci“ (Lucie 18. 11. 2026, večer)
export const CAFE_SUBTITLE = "Z kohoutku natočíte vždy jen objednanou porci. Polévky a čaje po otevření vydrží v lednici 14 dní, sirupy 3 měsíce.";
export const CAFE_DESCRIPTION = "Hotové polévky a nápoje pro kavárny a bistra dovážíme po celé ČR chlazenou přepravou. Ohřát a podávat, bez odpadu. Vyžádejte si ochutnávku do provozu.";

/** Jasná věta „co děláme“ pro lidi i vyhledávače a AI (Lucie 20. 11. 2026) — Pro kavárny a bistra i úvod. */
export const CAFE_DELIVERY_LINE = "Kavárnám a bistrům dovážíme hotové polévky a nápoje po celé ČR chlazenou přepravou.";

/** Řádek pod tlačítkem Do košíku na stránce produktu (Lucie 20. 11. 2026). */
export const CAFE_PRODUCT_LINE = { text: "Odebíráte pro kavárnu nebo bistro?", link: "Ochutnávka do provozu" } as const;

export type CafeIcon = "recycle" | "timer" | "calculator" | "leaf" | "droplets" | "truck";

export const CAFE_BENEFITS: { icon: CafeIcon; title: string; text: string }[] = [
  { icon: "recycle", title: "Žádné zbytky", text: "Natočíte vždy jen objednanou porci, zbytek počká v lednici. Polévky a čaje po otevření vydrží v lednici 14 dní, sirupy 3 měsíce." },
  { icon: "timer", title: "Bez práce", text: "Polévku stačí ohřát a podávat, nápoje jen naředit." },
  { icon: "calculator", title: "Spočítané porce", text: "Polévka 250 ml za 31,60 Kč, nápoj ze sirupu od 3,30 Kč – při ceně z e-shopu." },
  { icon: "leaf", title: "100% rostlinné", text: "Polévky a nealkoholické nápoje jsou vhodné pro vegany i vegetariány." },
  { icon: "droplets", title: "Z čisté filtrované vody", text: "Polévky, sirupy, čaje i ovocné nápoje vyrábíme bez konzervantů." },
  { icon: "truck", title: "Doprava po celé ČR", text: "Chlazená přeprava až k vám, nebo osobní odběr ve Viticích." },
];

/** Kategorie, které provozům dodáváme — včetně alkoholických koktejlů (Lucie 18. 11. 2026); jen se nepropagují jako rostlinné. */
export const CAFE_CATEGORY_SLUGS = ["polevky", "sirupy", "caje", "ovocne-napoje", "koktejly", "zmrzliny"] as const;

/** Povinná poznámka u alkoholu a štítek kategorie, která je na e-shopu zatím prázdná (bez odkazu). */
export const CAFE_ALCOHOL_NOTE = "18+";
export const CAFE_ALCOHOL_SLUG = "koktejly";
export const CAFE_COMING_SOON = "Připravujeme";

export const CAFE_STEPS = [
  { title: "Ochutnávka", text: "Ochutnávku si objednáte níž na této stránce a pošleme ji chlazenou přepravou, nebo si ji vyzvednete ve Viticích. Vše si vyzkoušíte v klidu u sebe." },
  // Objednávky jdou přes e-shop a chlazenou přepravu, žádné „závozy“ (Lucie 18. 11. 2026)
  { title: "Objednávka na e-shopu", text: "Objednáte, co vám chutnalo, přímo tady na e-shopu, na firmu i s IČO." },
  { title: "Sleva za pravidelné objednávky", text: "Čím víc objednáte, tím větší slevu dostanete v partnerském programu (3 až 7 %)." },
] as const;

export const CAFE_FORM_HEADING = "Chci ochutnávku do provozu";
export const CAFE_FORM_DONE = "Děkujeme, ozveme se vám do 2 pracovních dnů.";
// Zvláštní ceník pro provozy neexistuje (Lucie 18. 11. 2026): ceny jako na e-shopu + partnerský program.
export const CAFE_PRICE_NOTE = { before: "Ceny jsou stejné jako na e-shopu. Při pravidelném odběru získáte slevu 3 až 7 % v ", link: "partnerském programu", href: "/partnersky-program", after: "." } as const;

export type CafeInquiryRaw = { venue: string; name: string; phone: string; email: string; city: string; note: string };
export type CafeInquiry = { venue: string; name: string; phone: string; email: string | null; city: string | null; note: string | null };
export type CafeField = keyof CafeInquiryRaw;

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

/** Telefon: číslice, mezery, +, pomlčky; aspoň 9 číslic. Vrací zapsaný tvar bez nadbytečných mezer. */
export function normalizeCafePhone(raw: string): string | null {
  const value = clean(raw);
  if (!/^\+?[0-9 ()/-]{9,24}$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15 ? value : null;
}

export function validateCafeInquiry(raw: CafeInquiryRaw): { ok: true; value: CafeInquiry } | { ok: false; error: string; field: CafeField } {
  const venue = clean(raw.venue);
  if (venue.length < 2) return { ok: false, field: "venue", error: "Vyplňte prosím název podniku." };
  if (venue.length > 120) return { ok: false, field: "venue", error: "Název podniku může mít nejvýše 120 znaků." };
  const name = clean(raw.name);
  if (name.length < 2) return { ok: false, field: "name", error: "Vyplňte prosím své jméno." };
  if (name.length > 120) return { ok: false, field: "name", error: "Jméno může mít nejvýše 120 znaků." };
  const phone = normalizeCafePhone(raw.phone);
  if (!phone) return { ok: false, field: "phone", error: "Zadejte prosím telefon, na který vám můžeme zavolat." };
  // e-mail nepovinný (dokument ChatGPT, Lucie 22. 11. 2026): kdo chce jen zavolat, napíše telefon
  const email = clean(raw.email).toLowerCase();
  if (email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) return { ok: false, field: "email", error: "Zadejte prosím platný e-mail, nebo pole nechte prázdné." };
  const city = clean(raw.city);
  if (city.length > 120) return { ok: false, field: "city", error: "Město může mít nejvýše 120 znaků." };
  const note = raw.note.replace(/\r\n/g, "\n").trim();
  if (note.length > 1000) return { ok: false, field: "note", error: "Poznámka může mít nejvýše 1000 znaků." };
  return { ok: true, value: { venue, name, phone, email: email || null, city: city || null, note: note || null } };
}

/** Porovnávací tvar telefonu: posledních 9 číslic (bez předvolby) — stejné pravidlo jako u leadů z Mety. */
export function phoneMatchKey(raw: string | null): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

export function emailMatchKey(raw: string | null): string | null {
  const t = (raw ?? "").trim().toLowerCase();
  return t.includes("@") ? t : null;
}

/** Kde byl formulář vyplněn: stránka Pro kavárny a bistra, nebo úvodní stránka (Lucie 20. 11. 2026). */
export type CafeFormPlace = "kavarny" | "uvod";
export const CAFE_FORM_PLACES: Record<CafeFormPlace, { leadSource: string; pageLabel: string }> = {
  kavarny: { leadSource: "web_kavarny", pageLabel: "begina.cz/pro-kavarny" },
  uvod: { leadSource: "web_uvod", pageLabel: "úvodní stránce begina.cz" },
};
export function cafeFormPlace(raw: string | null | undefined): CafeFormPlace {
  return raw === "uvod" ? "uvod" : "kavarny";
}

/** Text do historie kontaktu v CRM. */
export function describeCafeInquiry(inquiry: CafeInquiry, submittedLabel: string, place: CafeFormPlace = "kavarny"): string {
  return [
    `Formulář „Chci ochutnávku do provozu“ na ${CAFE_FORM_PLACES[place].pageLabel} vyplněn ${submittedLabel}.`,
    `Provoz: ${inquiry.venue}`,
    `Jméno: ${inquiry.name}`,
    `Telefon: ${inquiry.phone}`,
    `E-mail: ${inquiry.email ?? "neuveden"}`,
    inquiry.city ? `Město: ${inquiry.city}` : null,
    inquiry.note ? `Poznámka: ${inquiry.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Neplátce DPH (Lucie 22. 11. 2026): patička, pokladna, Pro kavárny a bistra. */
export const VAT_NOTE = "Nejsme plátci DPH – uvedené ceny jsou konečné, nic se k nim nepřičítá.";

/**
 * „Zeptat se na vzorky“ (Lucie 22. 11. 2026): u čajů, ovocných nápojů a koktejlů, ke kterým
 * se vzorky na e-shopu objednat nedají (Svařák Deluxe vzorek má). Jinak null.
 */
export const ASK_SAMPLES_CATEGORIES = ["caje", "ovocne-napoje", "koktejly"] as const;
export const ASK_SAMPLES_EXCEPT_SLUGS = ["svarak-deluxe"] as const;
export function askSamplesLink(product: { category: string; slug: string }): { text: string; label: string; href: string } | null {
  if (!(ASK_SAMPLES_CATEGORIES as readonly string[]).includes(product.category)) return null;
  if ((ASK_SAMPLES_EXCEPT_SLUGS as readonly string[]).includes(product.slug)) return null;
  return { text: "Provozujete kavárnu nebo bistro?", label: "Zeptat se na vzorky", href: `${CAFE_PATH}#napiste-nam` };
}

/** Odkazy na nabídku polévek pro kavárny (dokument ChatGPT „SEO pro kavárny“, Lucie 22. 11. 2026). */
export const SOUPS_FOR_CAFES_PATH = "/polevky-pro-kavarny";
export const CAFE_SOUPS_TEASER = {
  text: "Chcete do polední nabídky přidat polévku? Vyberte si ze šesti druhů. V nabídce pro kavárny najdete velikost porce, cenu chlazené dopravy i možnost ochutnat jednotlivé příchutě.",
  label: "Prohlédnout polévky pro svůj podnik",
  href: SOUPS_FOR_CAFES_PATH,
} as const;
export const CATEGORY_SOUPS_TEASER = {
  text: "Vybíráte polévky do svého podniku? Připravili jsme pro Vás přehled porcí, cen dopravy a ochutnávek pro kavárny a bistra.",
  label: "Porce a doprava polévek pro kavárny",
  href: SOUPS_FOR_CAFES_PATH,
} as const;
/** SEO titulek a popis kategorie Čerstvé polévky (dokument ChatGPT). */
export const SOUPS_CATEGORY_SEO = {
  title: "Čerstvé rostlinné polévky v balení 3 l | Begina",
  description: "Vyberte si ze šesti rostlinných polévek z čisté filtrované vody. Třílitrové balení s kohoutkem doručujeme chlazené po celé ČR, domů i do kavárny.",
} as const;
