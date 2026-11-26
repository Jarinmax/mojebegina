// PROJEKT BEGINA — oblasti a kontrola vstupu (bez DB, testovatelné).
// Jedna oblast = jedno vlákno v Claudovi (26. 11. 2026, Lucie). V každé jen
// stav, rozhodnutí a výstupy. Slug se nikdy nemění (drží zápisy v DB) — měnit
// se smí jen název; „web“ = Úpravy e-shopu, „ekonomika“ = Účtenky a náklady.

export const PROJECT_GROUPS = ["Prodej", "Web a systém", "Marketing", "Výroba a provoz", "Peníze a právo"] as const;
export type ProjectGroup = (typeof PROJECT_GROUPS)[number];

export const PROJECT_AREAS = [
  { slug: "objednavky", name: "Objednávky zákazníků", icon: "cart", tone: "orange", group: "Prodej" },
  { slug: "faktury", name: "Faktury zákazníkům", icon: "file", tone: "blue", group: "Prodej" },
  { slug: "kavarny", name: "Kavárny a obchod", icon: "coffee", tone: "stone", group: "Prodej" },
  { slug: "partnersky-program", name: "Partnerský program", icon: "handshake", tone: "teal", group: "Prodej" },
  { slug: "kampan-sirupy", name: "Kampaň sirupy", icon: "megaphone", tone: "fuchsia", group: "Prodej" },
  { slug: "web", name: "Úpravy e-shopu", icon: "globe", tone: "emerald", group: "Web a systém" },
  { slug: "seo", name: "SEO", icon: "search", tone: "cyan", group: "Web a systém" },
  { slug: "mojebegina", name: "Úpravy MojeBegina", icon: "dashboard", tone: "indigo", group: "Web a systém" },
  { slug: "konkurence", name: "Konkurence", icon: "binoculars", tone: "sky", group: "Web a systém" },
  { slug: "socialni-site", name: "Sociální sítě", icon: "share", tone: "rose", group: "Marketing" },
  { slug: "obrazky", name: "Obrázky a fotky", icon: "image", tone: "violet", group: "Marketing" },
  { slug: "etikety", name: "Etikety", icon: "tag", tone: "amber", group: "Výroba a provoz" },
  { slug: "sklad-beginy", name: "Sklad begin a sáčků", icon: "package", tone: "yellow", group: "Výroba a provoz" },
  { slug: "sklad-suroviny", name: "Sklad surovin a obalů", icon: "boxes", tone: "orange", group: "Výroba a provoz" },
  { slug: "hygiena", name: "Hygiena a HACCP", icon: "shield", tone: "green", group: "Výroba a provoz" },
  { slug: "bistro", name: "Bistro", icon: "utensils", tone: "red", group: "Výroba a provoz" },
  { slug: "ekonomika", name: "Účtenky a náklady", icon: "wallet", tone: "lime", group: "Peníze a právo" },
  { slug: "pravo", name: "Legislativa a právo", icon: "scale", tone: "slate", group: "Peníze a právo" },
  { slug: "fillette", name: "FILLETTE – převod firmy", icon: "building", tone: "purple", group: "Peníze a právo" },
] as const;

export type ProjectArea = (typeof PROJECT_AREAS)[number];
export type ProjectAreaSlug = ProjectArea["slug"];
export const PROJECT_AREA_SLUGS = PROJECT_AREAS.map((a) => a.slug) as ProjectAreaSlug[];

export const PROJECT_KINDS = ["status", "decision", "output"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];
export const KIND_LABELS: Record<ProjectKind, string> = { status: "Stav", decision: "Rozhodnutí", output: "Výstup" };

export const LIMITS = { title: 200, body: 2000, url: 1000 } as const;

export function findArea(slug: string): ProjectArea | null {
  return PROJECT_AREAS.find((a) => a.slug === slug) ?? null;
}

export type ProjectInput = { area: ProjectAreaSlug; kind: ProjectKind; title: string | null; body: string | null; url: string | null };
export type ProjectInputResult = { ok: true; value: ProjectInput } | { ok: false; error: string };

const clean = (value: unknown, max: number): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : null;
};

/** Odkaz jen http(s) — nic jiného (javascript: apod.) do stránky nepustíme. */
export function cleanUrl(value: unknown): string | null | "invalid" {
  const raw = clean(value, LIMITS.url);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "invalid";
  } catch {
    return "invalid";
  }
}

export function validateProjectInput(raw: { area: unknown; kind: unknown; title?: unknown; body?: unknown; url?: unknown }): ProjectInputResult {
  const area = typeof raw.area === "string" ? findArea(raw.area) : null;
  if (!area) return { ok: false, error: `Neznámá oblast. Povolené: ${PROJECT_AREA_SLUGS.join(", ")}.` };
  const kind = PROJECT_KINDS.find((k) => k === raw.kind);
  if (!kind) return { ok: false, error: "Druh zápisu musí být status (stav), decision (rozhodnutí) nebo output (výstup)." };
  const title = clean(raw.title, LIMITS.title);
  const body = clean(raw.body, LIMITS.body);
  const url = cleanUrl(raw.url);
  if (url === "invalid") return { ok: false, error: "Odkaz musí začínat https:// (nebo http://)." };
  if (kind === "status" && !body) return { ok: false, error: "Napište, kde to teď je." };
  if (kind === "decision" && !title) return { ok: false, error: "Napište, co jste rozhodli." };
  if (kind === "output" && !title) return { ok: false, error: "Napište název výstupu." };
  return { ok: true, value: { area: area.slug, kind, title: kind === "status" ? null : title, body, url } };
}

export function formatCzDate(iso: string): string {
  return `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}`;
}
