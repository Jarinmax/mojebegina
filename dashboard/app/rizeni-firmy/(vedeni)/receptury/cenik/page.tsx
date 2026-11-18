import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { formatUnitPrice, isOfferInUse, lowestRegularUnitPriceKc, offerUnitPriceKc, priceUnitLabel, type PriceUnit, type RecipeIngredient, type RecipeOffer } from "@/lib/receptury/recipes";
import { loadOffers, loadRecipes, offerTableExists, recipeTablesExist } from "@/lib/receptury/recipesServer";
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

export default async function CenikSurovinPage() {
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

  const section = (title: string, rows: RecipeIngredient[], withUsage: boolean) => (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-begina-primary-900 mb-2">{title}</h2>
      <div className="bg-white border border-neutral-200 rounded-xl">{rows.map((row) => card(row, withUsage))}</div>
    </section>
  );

  const other = offers.filter((offer) => offer.ingredientId === null);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 text-neutral-900">
      <h1 className="mt-2 text-2xl font-semibold">Ceník surovin a obalů</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Cena v ceníku platí pro všechny receptury — po uložení se náklady a marže přepočítají všude, kde se surovina nebo obal používá. Pod každou položkou jsou nabídky dodavatelů s odkazem na nákup; cena za jednotku je včetně dopravy. Zeleně je nabídka, podle které se dnes počítá; tlačítkem „Počítat touto cenou“ ji změníte.
      </p>
      {!hasOffers && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Nabídky dodavatelů ještě nejsou v databázi — je potřeba spustit v Neonu skript 128_nakupy_surovin_MAIN.</p>}
      {section("Obaly a etikety", ingredients.filter((item) => item.kind === "obal"), false)}
      {section("Suroviny", ingredients.filter((item) => item.kind === "surovina"), true)}
      {hasOffers && (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Ostatní nákupy (mimo receptury)</h2>
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
        </section>
      )}
    </div>
  );
}
