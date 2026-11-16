// Tlačítko „← Zpět" v liště Řízení firmy a Práce (16. 11. 2026, přání Lucie):
// vrací o JEDEN krok výš ve struktuře stránek, ne až na úvodní obrazovku role.
// Z /rizeni-firmy/ekonomika tedy na /rizeni-firmy; teprve z /rizeni-firmy
// na úvod (fallback = /admin nebo /executive).

/** Kořeny sekcí: z nich se jde na úvodní obrazovku role. */
const SECTION_ROOTS = ["/rizeni-firmy", "/prace"];

/** Mezistupně adresy, které samy stránku nemají — přeskočí se o další krok výš. */
const NOT_PAGES = new Set(["/rizeni-firmy/obchod/leady", "/rizeni-firmy/obchod/zakaznici", "/rizeni-firmy/sklad/prijemky", "/rizeni-firmy/uzel", "/rizeni-firmy/faktury", "/prace/ukol"]);

export function parentHref(pathname: string | null | undefined, fallback: string): string {
  if (!pathname) return fallback;
  const path = pathname.split("?")[0].replace(/\/+$/, "");
  const root = SECTION_ROOTS.find((item) => path === item || path.startsWith(`${item}/`));
  if (!root || path === root) return fallback;
  let parent = path.slice(0, path.lastIndexOf("/"));
  while (parent.length > root.length && NOT_PAGES.has(parent)) parent = parent.slice(0, parent.lastIndexOf("/"));
  return parent.length >= root.length ? parent : root;
}
