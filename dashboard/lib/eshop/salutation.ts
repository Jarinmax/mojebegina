// Návrh oslovení do e-mailu partnerského programu (19. 11. 2026, Lucie):
// bez titulu „paní Odrazilová“ / „pane Nováku“; když si zákazník titul sám
// napsal do objednávky, použije se („paní magistro“, „pane inženýre“).
// Jen NÁVRH do pole — Lucie ho před schválením zkontroluje a může přepsat.

type Gender = "f" | "m";

// Pořadí = priorita (nejvyšší titul vyhrává). Bc. se v oslovení nepoužívá.
const TITLES: { re: RegExp; m: string; f: string }[] = [
  { re: /^prof\.?$/i, m: "pane profesore", f: "paní profesorko" },
  { re: /^doc\.?$/i, m: "pane docente", f: "paní docentko" },
  { re: /^(mudr|mvdr|mddr|judr|phdr|rndr|paeddr|thdr|pharmdr|rsdr|dr)\.?$/i, m: "pane doktore", f: "paní doktorko" },
  { re: /^ing\.?$/i, m: "pane inženýre", f: "paní inženýrko" },
  { re: /^mgr\.?$/i, m: "pane magistře", f: "paní magistro" },
];
const IGNORED = /^(bc|bca|mga|arch|ph\.?d|csc|mba|dis|ll\.?m|drsc|dipl)\.?,?$/i;

function maleVocative(surname: string): string {
  const s = surname;
  const lower = s.toLocaleLowerCase("cs");
  if (/[ýí]$/.test(lower)) return s; // Novotný, Krejčí
  if (lower.endsWith("a")) return s.slice(0, -1) + "o"; // Průcha → Průcho
  if (lower.endsWith("ek")) return s.slice(0, -2) + "ku"; // Hájek → Hájku
  if (/[khg]$/.test(lower)) return s + "u"; // Novák → Nováku
  if (lower.endsWith("r")) return s + "e"; // Kocour → Kocoure
  if (/[šžčřcjďťň]$/.test(lower)) return s + "i"; // Bartoš → Bartoši
  if (/[bdfjlmnpstvz]$/.test(lower)) return s + "e"; // Šustr… Brabec výjimky přepíše Lucie
  return s;
}

export function suggestSalutation(personName: string | null | undefined): string {
  const raw = (personName ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const tokens = raw.split(" ").map((t) => t.replace(/,$/, ""));
  let title: (typeof TITLES)[number] | null = null;
  const words: string[] = [];
  for (const t of tokens) {
    const hit = TITLES.find((x) => x.re.test(t));
    if (hit) {
      if (!title || TITLES.indexOf(hit) < TITLES.indexOf(title)) title = hit;
      continue;
    }
    if (IGNORED.test(t) || t.includes(".")) continue;
    words.push(t);
  }
  if (words.length === 0) return "";
  // Příjmení napsané jako první („Lisichkina Tatiana“, „Nováková Jana“) → prohodit.
  const FEMALE_SURNAME = /(ová|ova|ina|ská|cká|á)$/i;
  if (words.length === 2 && FEMALE_SURNAME.test(words[0]) && !FEMALE_SURNAME.test(words[1])) words.reverse();
  const surname = words[words.length - 1];
  const first = words.length > 1 ? words[0] : "";
  const sl = surname.toLocaleLowerCase("cs");
  const gender: Gender = /(ová|ova|ina|á)$/.test(sl) || (!!first && /a$/i.test(first) && !/[ýí]$/.test(sl)) ? "f" : "m";
  if (title) return gender === "f" ? title.f : title.m;
  return gender === "f" ? `paní ${surname}` : `pane ${maleVocative(surname)}`;
}
