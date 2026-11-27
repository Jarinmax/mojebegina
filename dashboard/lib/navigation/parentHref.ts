// Tlačítko „← Zpět" v liště Řízení firmy a Práce (16. 11. 2026, přání Lucie):
// vrací o JEDEN krok výš ve struktuře stránek, ne až na úvodní obrazovku role.
// Z /rizeni-firmy/ekonomika tedy na /rizeni-firmy; teprve z /rizeni-firmy
// na úvod (fallback = /admin nebo /executive).

/** Kořeny sekcí: z nich se jde na úvodní obrazovku role. */
const SECTION_ROOTS = ["/rizeni-firmy", "/prace"];

/** Mezistupně adresy, které samy stránku nemají — přeskočí se o další krok výš. */
export const NOT_PAGES = new Set(["/rizeni-firmy/obchod/leady", "/rizeni-firmy/obchod/zakaznici", "/rizeni-firmy/sklad/prijemky", "/rizeni-firmy/uzel", "/prace/ukol", "/rizeni-firmy/recepty/varka"]);

/**
 * Stránky, kde se kroky volí parametry v adrese (23. 11. 2026, Lucie: „v
 * etiketách nejde krok zpět, vyhodí mě to na začátek“). Zpět odebere poslední
 * zvolený krok; teprve bez parametrů jde o stránku výš.
 */
const QUERY_STEPS: Record<string, string[]> = {
  "/rizeni-firmy/etikety": ["jazyk", "kat", "vel", "druh"],
};

export function parentHref(pathname: string | null | undefined, fallback: string, search?: string | null): string {
  if (!pathname) return fallback;
  const path = pathname.split("?")[0].replace(/\/+$/, "");
  const steps = QUERY_STEPS[path];
  if (steps && search) {
    const q = new URLSearchParams(search);
    const last = [...steps].reverse().find((k) => q.has(k));
    if (last) {
      // Odeber poslední krok i vše, co na něm záviselo (a staré ?typ=).
      for (const k of steps.slice(steps.indexOf(last))) q.delete(k);
      q.delete("typ");
      const qs = q.toString();
      return `${path}${qs ? `?${qs}` : ""}`;
    }
  }
  const root = SECTION_ROOTS.find((item) => path === item || path.startsWith(`${item}/`));
  if (!root || path === root) return fallback;
  let parent = path.slice(0, path.lastIndexOf("/"));
  while (parent.length > root.length && NOT_PAGES.has(parent)) parent = parent.slice(0, parent.lastIndexOf("/"));
  return parent.length >= root.length ? parent : root;
}
