// Názvy stránek pro drobečkovou navigaci a „← Zpět na …“ (Lucie 27. 11. 2026:
// „nikdy nevím, kam mě Zpět vrátí“). Zpět vede vždy o úroveň výš a píše kam.
import { NOT_PAGES, parentHref } from "./parentHref";
import { etiketyStepLabel } from "@/lib/etikety/wizard";

const STATIC: Record<string, string> = {
  "/rizeni-firmy": "Řízení firmy",
  "/rizeni-firmy/asistent": "Asistent ChatGPT",
  "/rizeni-firmy/ceo": "CEO přehled",
  "/rizeni-firmy/doklady": "Náklady – účtenky",
  "/rizeni-firmy/doprava-kalkulacka": "Doprava CoolBalík",
  "/rizeni-firmy/ekonomika": "Finance",
  "/rizeni-firmy/etikety": "Etikety",
  "/rizeni-firmy/faktury": "Příjmy – faktury",
  "/rizeni-firmy/fotky-eshop": "Fotky na e-shop",
  "/rizeni-firmy/haccp": "HACCP",
  "/rizeni-firmy/kampan-set": "Kampaň set",
  "/rizeni-firmy/legislativni-audit": "Legislativní audit",
  "/rizeni-firmy/mereni-eshopu": "Měření e-shopu",
  "/rizeni-firmy/obchod": "Obchod / CRM",
  "/rizeni-firmy/obchod/dnes": "Dnešní hovory",
  "/rizeni-firmy/obchod/leady/novy": "Nový lead",
  "/rizeni-firmy/obchod/manual": "Manuál pro obchodníky",
  "/rizeni-firmy/objednavky": "Objednávky",
  "/rizeni-firmy/objednavky-po-terminu": "Objednávky po termínu",
  "/rizeni-firmy/objednavky/idoklad": "Archiv iDoklad",
  "/rizeni-firmy/objednavky/nova": "Nová objednávka",
  "/rizeni-firmy/partnersky-program": "Partnerský program",
  "/rizeni-firmy/pokladna": "Pokladna bistra",
  "/rizeni-firmy/pokladna/menu": "Menu",
  "/rizeni-firmy/pokladna/uzaverka": "Uzávěrka",
  "/rizeni-firmy/projekt": "Projekt Begina",
  "/rizeni-firmy/receptury": "Náklady a marže",
  "/rizeni-firmy/receptury/cenik": "Ceník surovin a obalů",
  "/rizeni-firmy/recepty": "Recepty",
  "/rizeni-firmy/sklad": "Sklad surovin a obalů",
  "/rizeni-firmy/sklad/nova-prijemka": "Nová příjemka",
  "/rizeni-firmy/slovenske-listy": "Slovenské listy",
  "/rizeni-firmy/vyroba": "Výroba a expedice",
  "/rizeni-firmy/vyroba/sarze": "Nová šarže",
  "/rizeni-firmy/vyroba/sklad-hotovych": "Sklad hotových výrobků",
  "/prace": "Práce",
  "/prace/kontrola-eshopu": "Kontrola e-shopu",
  "/prace/odmeny": "Odměny",
  "/prace/hovory": "Hovory",
};

/** Stránky s proměnnou částí adresy: [vzor, název]. */
const DYNAMIC: [RegExp, string][] = [
  [/^\/rizeni-firmy\/recepty\/varka\/[^/]+$/, "Várka"],
  [/^\/rizeni-firmy\/recepty\/[^/]+$/, "Recept"],
  [/^\/rizeni-firmy\/receptury\/[^/]+$/, "Náklady výrobku"],
  [/^\/rizeni-firmy\/objednavky\/[^/]+$/, "Objednávka"],
  [/^\/rizeni-firmy\/vyroba\/[^/]+$/, "Karta objednávky"],
  [/^\/rizeni-firmy\/obchod\/leady\/[^/]+\/prevest$/, "Převést na zákazníka"],
  [/^\/rizeni-firmy\/obchod\/leady\/[^/]+$/, "Lead"],
  [/^\/rizeni-firmy\/obchod\/zakaznici\/[^/]+$/, "Zákazník"],
  [/^\/rizeni-firmy\/sklad\/prijemky\/[^/]+\/kontrola$/, "Kontrola příjemky"],
  [/^\/rizeni-firmy\/sklad\/prijemky\/[^/]+\/znovu-precist$/, "Znovu přečíst"],
  [/^\/rizeni-firmy\/sklad\/prijemky\/[^/]+$/, "Příjemka"],
  [/^\/rizeni-firmy\/pokladna\/uctenka\/[^/]+$/, "Účtenka"],
  [/^\/rizeni-firmy\/projekt\/[^/]+$/, "Oblast projektu"],
  [/^\/rizeni-firmy\/ceo\/[^/]+$/, "Detail"],
  [/^\/rizeni-firmy\/uzel\/[^/]+$/, "Úkol"],
  [/^\/prace\/ukol\/[^/]+$/, "Úkol"],
];

export function pageLabel(path: string, homeLabel = "hlavní stránku"): string {
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  if (STATIC[clean]) return STATIC[clean];
  for (const [re, label] of DYNAMIC) if (re.test(clean)) return label;
  if (!clean.startsWith("/rizeni-firmy") && !clean.startsWith("/prace")) return homeLabel;
  return "předchozí stránku";
}

export type Crumb = { href: string; label: string };

/** Cesta od kořene sekce k aktuální stránce (poslední = aktuální stránka). */
export function breadcrumbs(pathname: string): Crumb[] {
  const path = pathname.split("?")[0].replace(/\/+$/, "");
  const root = ["/rizeni-firmy", "/prace"].find((r) => path === r || path.startsWith(`${r}/`));
  if (!root) return [];
  const crumbs: Crumb[] = [];
  let current = path;
  while (current.length >= root.length) {
    if (!NOT_PAGES.has(current)) crumbs.unshift({ href: current, label: pageLabel(current) });
    if (current === root) break;
    current = current.slice(0, current.lastIndexOf("/"));
  }
  return crumbs;
}

/** Kam vede „Zpět“ a jak se to místo jmenuje. */
export function backTarget(pathname: string, fallback: string, search?: string | null): Crumb {
  const href = parentHref(pathname, fallback, search);
  const samePath = href.split("?")[0] === pathname.split("?")[0].replace(/\/+$/, "");
  const label =
    href === fallback
      ? "hlavní stránku"
      : samePath && href.split("?")[0] === "/rizeni-firmy/etikety"
        ? etiketyStepLabel(href.split("?")[1] ?? "")
        : pageLabel(href);
  return { href, label };
}
