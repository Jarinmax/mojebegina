// Stránka „Pro kavárny a bistra“ (begina.cz/pro-kavarny) — zadání Lucie
// 18. 11. 2026: hlavní zákazníci Beginy jsou kavárny a bistra. Texty a
// kontrola formuláře „Chci ochutnávku do provozu“ (čisté funkce, testy
// lib/eshop/__tests__/cafePage.test.ts).
//
// Pravidla: vykání, žádná zdravotní tvrzení, žádné velkoobchodní ceny
// (ceny porcí jsou z běžného e-shopu), alkoholické nápoje se tu nepropagují.
// Trvanlivost po otevření podle e-shopu: polévky a čaje 14 dní, sirupy
// 3 měsíce (ovocné nápoje 5 dní — proto se u nich výdrž neuvádí).

export const CAFE_PATH = "/pro-kavarny";
// V menu kratší název: s „Pro kavárny a bistra“ se menu na šířce 1280 px nevešlo vedle košíku.
export const CAFE_MENU_LABEL = "Kavárny a bistra";
export const CAFE_TITLE = "Polévky a nápoje pro kavárny a bistra";
export const CAFE_SUBTITLE = "Natočíte z kohoutku, nic nevyhodíte. Polévky a čaje po otevření vydrží v lednici 14 dní, sirupy 3 měsíce.";
export const CAFE_DESCRIPTION = "Čerstvé polévky, bylinné sirupy, čaje a ovocné nápoje v begině pro kavárny a bistra. Ohřát a podávat, bez odpadu. Vyžádejte si ochutnávku do provozu.";
export const CAFE_HOME_STRIP = "Jste kavárna nebo bistro? Polévky a nápoje v begině pro váš provoz";

export type CafeIcon = "recycle" | "timer" | "calculator" | "leaf" | "droplets" | "truck";

export const CAFE_BENEFITS: { icon: CafeIcon; title: string; text: string }[] = [
  { icon: "recycle", title: "Bez odpadu", text: "Natáčíte jen tolik, kolik prodáte. Polévky a čaje po otevření vydrží v lednici 14 dní, sirupy 3 měsíce." },
  { icon: "timer", title: "Bez práce", text: "Polévku stačí ohřát a podávat, nápoje jen naředit." },
  { icon: "calculator", title: "Spočítané porce", text: "Polévka 250 ml za 31,60 Kč, nápoj ze sirupu od 3,30 Kč – při ceně z e-shopu." },
  { icon: "leaf", title: "100% rostlinné", text: "Polévky a nealkoholické nápoje jsou vhodné pro vegany i vegetariány." },
  { icon: "droplets", title: "Z čisté filtrované vody", text: "Polévky, sirupy, čaje i ovocné nápoje vyrábíme bez konzervantů." },
  { icon: "truck", title: "Doprava po celé ČR", text: "Chlazená přeprava až k vám, nebo osobní odběr ve Viticích." },
];

/** Kategorie, které provozům dodáváme (alkoholické koktejly úmyslně chybí). */
export const CAFE_CATEGORY_SLUGS = ["polevky", "sirupy", "caje", "ovocne-napoje"] as const;

export const CAFE_STEPS = [
  { title: "Ochutnávka", text: "Pošleme vám ochutnávku do provozu, ať si vše vyzkoušíte v klidu." },
  { title: "Objednávka na fakturu", text: "Objednáte, co vám chutnalo. Platíte převodem na fakturu." },
  { title: "Pravidelné závozy", text: "Vozíme podle vaší spotřeby, abyste měli vždy čerstvé zboží." },
] as const;

export const CAFE_FORM_HEADING = "Chci ochutnávku do provozu";
export const CAFE_FORM_DONE = "Děkujeme, ozveme se vám do 2 pracovních dnů.";
export const CAFE_PRICE_LIST_NOTE = "Ceník pro provozy pošleme na vyžádání.";

export type CafeInquiryRaw = { venue: string; name: string; phone: string; email: string; city: string; note: string };
export type CafeInquiry = { venue: string; name: string; phone: string; email: string; city: string | null; note: string | null };
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
  if (venue.length < 2) return { ok: false, field: "venue", error: "Vyplňte prosím název provozu." };
  if (venue.length > 120) return { ok: false, field: "venue", error: "Název provozu může mít nejvýše 120 znaků." };
  const name = clean(raw.name);
  if (name.length < 2) return { ok: false, field: "name", error: "Vyplňte prosím své jméno." };
  if (name.length > 120) return { ok: false, field: "name", error: "Jméno může mít nejvýše 120 znaků." };
  const phone = normalizeCafePhone(raw.phone);
  if (!phone) return { ok: false, field: "phone", error: "Zadejte prosím telefon, na který vám můžeme zavolat." };
  const email = clean(raw.email).toLowerCase();
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, field: "email", error: "Zadejte prosím platný e-mail." };
  const city = clean(raw.city);
  if (city.length > 120) return { ok: false, field: "city", error: "Město může mít nejvýše 120 znaků." };
  const note = raw.note.replace(/\r\n/g, "\n").trim();
  if (note.length > 1000) return { ok: false, field: "note", error: "Poznámka může mít nejvýše 1000 znaků." };
  return { ok: true, value: { venue, name, phone, email, city: city || null, note: note || null } };
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

/** Text do historie kontaktu v CRM. */
export function describeCafeInquiry(inquiry: CafeInquiry, submittedLabel: string): string {
  return [
    `Formulář „Chci ochutnávku do provozu“ na begina.cz/pro-kavarny vyplněn ${submittedLabel}.`,
    `Provoz: ${inquiry.venue}`,
    `Jméno: ${inquiry.name}`,
    `Telefon: ${inquiry.phone}`,
    `E-mail: ${inquiry.email}`,
    inquiry.city ? `Město: ${inquiry.city}` : null,
    inquiry.note ? `Poznámka: ${inquiry.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
