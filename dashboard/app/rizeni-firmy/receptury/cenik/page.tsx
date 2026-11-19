import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { formatUnitPrice, isOfferInUse, lowestRegularUnitPriceKc, offerUnitPriceKc, priceUnitLabel, type PriceUnit, type RecipeIngredient, type RecipeOffer } from "@/lib/receptury/recipes";
import { loadOffers, loadRecipes, offerTableExists, recipeTablesExist } from "@/lib/receptury/recipesServer";
import Link from "next/link";
import { INGREDIENT_GROUPS, ingredientGroupKey } from "@/lib/receptury/ingredientGroups";
import OfferForm from "./OfferForm";
import OfferRow, { type OfferView } from "./OfferRow";
import PriceRow from "./PriceRow";

// RECEPTURY A NÁKLADY 1.0 — ceník surovin a obalů. Jedna cena pro všechny
// receptury; po uložení se náklady a marže přepočítají všude.
// NÁKUPY SUROVIN 1.0 — pod každou surovinou nabídky dodavatelů s odkazy
// (dřív Google tabulka „Suroviny nákupy Begina“).
export const dynamic = "force-dynamic";

const num = (value: number) => value.toLocaleString("cs-CZ", { maximumFractionDigits: 4 });
const UNIT_HINT: Record<PriceUnit, string> = { kg: "v kg", l: "v litrech", ks: "kusů", kapka: "kapek" };

function offerView(offer: RecipeOffer, priceKc: number | null, lowest: number | null): OfferView {
  const unit = offerUnitPriceKc(offer);
  return {
    id: offer.id,
    ingredientId: offer.ingredientId,
    itemName: offer.itemName,
    url: offer.url,
    packLabel: offer.packLabel,
    packQty: num(offer.packQty),
    priceKc: num(offer.priceKc),
    shippingKc: num(offer.shippingKc),
    isPromo: offer.isPromo,
    note: offer.note,
    unitPrice: formatUnitPrice(unit),
    inUse: priceKc !== null && isOfferInUse(offer, priceKc),
    isLowest: lowest !== null && Math.abs(unit - lowest) < 0.005,
  };
}

const emptyOffer = (ingredientId: string | null) => ({ ingredientId, itemName: "", url: null, packLabel: "", packQty: "", priceKc: "", shippingKc: "0", isPromo: false, note: null });

export default async function CenikSurovinPage({ searchParams }: { searchParams: Promise<{ skupina?: string | string[]; polozka?: string | string[] }> }) {
  const sp = await searchParams;
  const groupParam = Array.isArray(sp.skupina) ? sp.skupina[0] : sp.skupina;
  const itemParam = Array.isArray(sp.polozka) ? sp.polozka[0] : sp.polozka;
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  if (!(await recipeTablesExist())) notFound();

  const [{ recipes, ingredients }, offers, hasOffers] = await Promise.all([loadRecipes(), loadOffers(), offerTableExists()]);
  const usage = new Map<string, number>();
  for (const recipe of recipes) for (const id of new Set(recipe.items.map((item) => item.ingredient.id))) usage.set(id, (usage.get(id) ?? 0) + 1);

  const card = (row: RecipeIngredient, withUsage: boolean) => {
    const own = offers.filter((offer) => offer.ingredientId === row.id);
    const lowest = lowestRegularUnitPriceKc(own);
    const unitLabel = priceUnitLabel(row.priceUnit);
    const notLowest = lowest !== null && row.priceKc - lowest >= 0.005;
    return (
      <div key={row.id} className="border-b border-neutral-100 last:border-0 px-3 py-3">
        <PriceRow id={row.id} name={row.name} unitLabel={unitLabel} price={formatUnitPrice(row.priceKc)} usedIn={withUsage ? (usage.get(row.id) ?? 0) : null} />
        {notLowest && <p className="mt-1 text-xs text-amber-700">Pozor: nejnižší běžná nabídka je {formatUnitPrice(lowest)} {unitLabel}.</p>}
        {hasOffers && (
          <>
            {own.length > 0 && (
              <ul className="mt-2 rounded-lg border border-neutral-100">
                {own.map((offer) => (
                  <OfferRow key={offer.id} offer={offerView(offer, row.priceKc, lowest)} unitLabel={unitLabel} canUse />
                ))}
              </ul>
            )}
            <div className="mt-1">
              <OfferForm values={emptyOffer(row.id)} label="+ Přidat nabídku" unitHint={UNIT_HINT[row.priceUnit]} />
            </div>
          </>
        )}
      </div>
    );
  };

  const other = offers.filter((offer) => offer.ingredientId === null);
  const sortCz = (rows: RecipeIngredient[]) => [...rows].sort((x, y) => x.name.localeCompare(y.name, "cs"));
  const groups = INGREDIENT_GROUPS.map((g) => {
    const rows = g.key === "mimo" ? [] : sortCz(ingredients.filter((item) => ingredientGroupKey(item.name, item.kind) === g.key));
    const count = g.key === "mimo" ? other.length : rows.length;
    return { ...g, rows, count };
  }).filter((g) => (g.key === "mimo" ? hasOffers : g.count > 0));
  const active = groups.find((g) => g.key === groupParam) ?? null;
  const activeItem = active?.rows.find((row) => row.id === itemParam) ?? null;
  const BASE = "/rizeni-firmy/receptury/cenik";
  const offerCount = (id: string) => offers.filter((offer) => offer.ingredientId === id).length;
  const crumbs = [{ label: "Ceník", href: BASE }];
  if (active) crumbs.push({ label: active.label, href: `${BASE}?skupina=${active.key}` });
  if (active && activeItem) crumbs.push({ label: activeItem.name, href: `${BASE}?skupina=${active.key}&polozka=${activeItem.id}` });
  const countLabel = (n: number) => `${n} ${n === 1 ? "položka" : n >= 2 && n <= 4 ? "položky" : "položek"}`;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 text-neutral-900">
      <h1 className="mt-2 text-2xl font-semibold">Ceník surovin a obalů</h1>
      <p className={`mt-2 text-sm text-neutral-600 ${active ? "hidden sm:block" : ""}`}>
        Cena v ceníku platí pro všechny receptury — po uložení se náklady a marže přepočítají všude, kde se surovina nebo obal používá. Pod každou položkou jsou nabídky dodavatelů s odkazem na nákup; cena za jednotku je včetně dopravy. Zeleně je nabídka, podle které se dnes počítá; tlačítkem „Počítat touto cenou“ ji změníte.
      </p>
      {!hasOffers && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Nabídky dodavatelů ještě nejsou v databázi — je potřeba spustit v Neonu skript 128_nakupy_surovin_MAIN.</p>}
      {/* 19. 11. 2026 (Lucie): nejdřív skupina, pak jen její položky — na mobilu bez nekonečného scrollování. */}
      {!active ? (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {groups.map((g) => (
            <Link
              key={g.key}
              href={`/rizeni-firmy/receptury/cenik?skupina=${g.key}`}
              className="flex flex-col justify-center min-h-20 rounded-xl border border-neutral-200 bg-white px-4 py-3 hover:border-begina-primary-900"
            >
              <span className="text-base font-medium text-begina-primary-900">{g.label}</span>
              <span className="mt-0.5 text-xs text-neutral-500">{countLabel(g.count)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <>
          {/* Mobil: jen drobečky (Ceník › skupina › položka), počítač: i přepínač skupin. */}
          <nav aria-label="Kde jsem" className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-neutral-400">›</span>}
                {i === crumbs.length - 1 ? (
                  <span className="font-semibold text-begina-primary-900">{c.label}</span>
                ) : (
                  <Link href={c.href} className="text-neutral-600 underline underline-offset-2">{c.label}</Link>
                )}
              </span>
            ))}
          </nav>
          <div className="mt-3 hidden sm:flex flex-wrap gap-2">
            {groups.map((g) => (
              <Link
                key={g.key}
                href={`${BASE}?skupina=${g.key}`}
                className={
                  "px-3 py-1.5 rounded-full text-sm font-medium border " +
                  (g.key === active.key
                    ? "bg-begina-primary-900 text-white border-begina-primary-900"
                    : "bg-white text-begina-primary-900 border-neutral-300 hover:border-begina-primary-900")
                }
              >
                {g.label}
              </Link>
            ))}
          </div>
          <section className="mt-4">
            {active.key === "mimo" ? (
              <div className="bg-white border border-neutral-200 rounded-xl px-3 py-3">
                {other.length > 0 && (
                  <ul className="rounded-lg border border-neutral-100">
                    {other.map((offer) => (
                      <OfferRow key={offer.id} offer={offerView(offer, null, null)} unitLabel="Kč/jedn." canUse={false} />
                    ))}
                  </ul>
                )}
                <div className="mt-1"><OfferForm values={emptyOffer(null)} label="+ Přidat nákup" /></div>
              </div>
            ) : activeItem ? (
              <div className="bg-white border border-neutral-200 rounded-xl">{card(activeItem, activeItem.kind !== "obal")}</div>
            ) : (
              // 19. 11. 2026 (Lucie): ve skupině jen seznam názvů — ťuknutím se otevře jedna položka s nabídkami.
              <ul className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
                {active.rows.map((row) => {
                  const n = offerCount(row.id);
                  return (
                    <li key={row.id}>
                      <Link href={`${BASE}?skupina=${active.key}&polozka=${row.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-neutral-50">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-medium text-neutral-900 break-words">{row.name}</span>
                          <span className="block text-xs text-neutral-500">
                            {formatUnitPrice(row.priceKc)} {priceUnitLabel(row.priceUnit)} · {n === 0 ? "bez nabídky" : n === 1 ? "1 nabídka" : n <= 4 ? `${n} nabídky` : `${n} nabídek`}
                          </span>
                        </span>
                        <span aria-hidden className="text-neutral-400 text-lg">›</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
