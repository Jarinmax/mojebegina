// Šarže (Lucie 21. 11. 2026) — čistá logika bez databáze: trvanlivost,
// číslo šarže a kontrola vstupu. Trvanlivost neotevřeného balení od data
// výroby (Lucie 21. 11. 2026): polévky 3 týdny, čaje 3 týdny, sirup 3 l
// 6 měsíců, sirup v sáčku (i 100 ml) 3 měsíce; ovocné nápoje 14 dní a
// alkoholické koktejly 3 měsíce (dřívější rozhodnutí u etiket).

export const BATCH_VOLUMES = [3000, 650, 500, 200, 100] as const;
export type BatchVolume = (typeof BATCH_VOLUMES)[number];

export const VOLUME_LABELS: Record<BatchVolume, string> = {
  3000: "3 l (begina)",
  650: "650 ml (sáček)",
  500: "500 ml (sáček)",
  200: "200 ml (ochutnávka)",
  100: "100 ml (ochutnávka)",
};

const CATEGORY_LETTER: Record<string, string> = {
  polevky: "P",
  sirupy: "S",
  caje: "C",
  "ovocne-napoje": "N",
  koktejly: "K",
  zmrzliny: "Z",
};

/** Trvanlivost ve dnech, nebo { months }; null = neznámá (datum zadá Jarin ručně). */
export function shelfLife(categorySlug: string, volumeMl: number): { days: number } | { months: number } | null {
  switch (categorySlug) {
    case "polevky":
    case "caje":
      return { days: 21 };
    case "sirupy":
      return volumeMl >= 3000 ? { months: 6 } : { months: 3 };
    case "ovocne-napoje":
      return { days: 14 };
    case "koktejly":
      return { months: 3 };
    default:
      return null;
  }
}

function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Datum spotřeby (RRRR-MM-DD) z data výroby, nebo null, když trvanlivost neznáme. */
export function bestBefore(producedOn: string, categorySlug: string, volumeMl: number): string | null {
  const life = shelfLife(categorySlug, volumeMl);
  const start = parseIsoDate(producedOn);
  if (!life || !start) return null;
  const d = new Date(start);
  if ("days" in life) {
    d.setUTCDate(d.getUTCDate() + life.days);
  } else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + life.months);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return iso(d);
}

export function shelfLifeLabel(categorySlug: string, volumeMl: number): string {
  const life = shelfLife(categorySlug, volumeMl);
  if (!life) return "zadejte ručně";
  if ("days" in life) return life.days % 7 === 0 ? `${life.days / 7} týdny` : `${life.days} dní`;
  return `${life.months} měsíc${life.months >= 5 ? "ů" : "e"}`;
}

const STOP_WORDS = new Set(["polevka", "sirup", "caj", "bylinny", "cerny", "zeleny", "s", "z", "a", "se", "ze", "nealko"]);

/** Zkratka produktu ze slugu: dynova-polevka → DYN, kulajda → KUL, gulasova-polevka-z-hlivy-ustricne → GHU. */
export function productAbbr(slug: string): string {
  const words = slug
    .toLowerCase()
    .split("-")
    .filter((w) => w && !STOP_WORDS.has(w) && !/^\d/.test(w));
  const base = words.length > 0 ? words : slug.split("-").filter(Boolean);
  if (base.length === 1) return base[0].slice(0, 3).toUpperCase();
  if (base.length === 2) return (base[0].slice(0, 2) + base[1][0]).toUpperCase();
  return base.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}

/** Číslo šarže: písmeno kategorie + zkratka + datum výroby DDMMRR, druhá šarže téhož dne -2. Např. PDYN-211126. */
export function batchCode(categorySlug: string, productSlug: string, producedOn: string, sequence = 1): string {
  const [y, m, d] = producedOn.split("-");
  const base = `${CATEGORY_LETTER[categorySlug] ?? "X"}${productAbbr(productSlug)}-${d}${m}${y.slice(2)}`;
  return sequence > 1 ? `${base}-${sequence}` : base;
}

export type BatchLineInput = { volumeMl: BatchVolume; quantity: number; bestBefore?: string | null };
export type BatchInput = { productId: string; producedOn: string; lines: BatchLineInput[]; note?: string | null };

export function validateBatchInput(raw: {
  productId?: unknown;
  producedOn?: unknown;
  lines?: unknown;
  note?: unknown;
}, today: string): { ok: true; value: BatchInput } | { ok: false; error: string } {
  const productId = typeof raw.productId === "string" ? raw.productId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return { ok: false, error: "Vyberte produkt." };
  const producedOn = typeof raw.producedOn === "string" && raw.producedOn.trim() ? raw.producedOn.trim() : today;
  const produced = parseIsoDate(producedOn);
  if (!produced) return { ok: false, error: "Datum výroby musí být RRRR-MM-DD." };
  if (producedOn > today) return { ok: false, error: "Datum výroby nemůže být v budoucnosti." };
  const todayDate = parseIsoDate(today);
  if (todayDate && (todayDate.getTime() - produced.getTime()) / 86_400_000 > 60) return { ok: false, error: "Datum výroby je starší než 60 dní — zkontrolujte ho." };
  if (!Array.isArray(raw.lines)) return { ok: false, error: "Zadejte aspoň jedno balení." };
  const lines: BatchLineInput[] = [];
  const seen = new Set<number>();
  for (const item of raw.lines as unknown[]) {
    const line = (item ?? {}) as Record<string, unknown>;
    const volumeMl = Number(line.volumeMl);
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) continue;
    if (!(BATCH_VOLUMES as readonly number[]).includes(volumeMl)) return { ok: false, error: "Neznámé balení." };
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 500) return { ok: false, error: "Počet kusů musí být celé číslo 1–500." };
    if (seen.has(volumeMl)) return { ok: false, error: "Každé balení zadejte jen jednou." };
    seen.add(volumeMl);
    let bb: string | null = null;
    if (typeof line.bestBefore === "string" && line.bestBefore.trim()) {
      bb = line.bestBefore.trim();
      if (!parseIsoDate(bb)) return { ok: false, error: "Datum spotřeby musí být RRRR-MM-DD." };
      if (bb <= producedOn) return { ok: false, error: "Datum spotřeby musí být po datu výroby." };
    }
    lines.push({ volumeMl: volumeMl as BatchVolume, quantity, bestBefore: bb });
  }
  if (lines.length === 0) return { ok: false, error: "Zadejte aspoň jedno balení s počtem kusů." };
  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim().slice(0, 500) : null;
  return { ok: true, value: { productId, producedOn, lines, note } };
}

/** Dní do data spotřeby (záporné = prošlé). */
export function daysUntil(isoDate: string, today: string): number {
  const a = parseIsoDate(isoDate);
  const b = parseIsoDate(today);
  if (!a || !b) return 0;
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export function formatCzDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}
