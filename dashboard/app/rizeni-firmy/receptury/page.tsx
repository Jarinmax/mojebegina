import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { RECIPE_CATEGORIES, batchCostKc, calcVariant, formatKcValue } from "@/lib/receptury/recipes";
import { loadRecipes, packagingPrices, recipeTablesExist } from "@/lib/receptury/recipesServer";

// RECEPTURY A NÁKLADY 1.0 (16. 11. 2026) — přehled všech výrobků: náklad na
// 3l beginu a marže. Přístup JEN Jaroslav a Lucie (isInvoiceIssuer);
// ostatním se stránka tváří, že neexistuje.
export const dynamic = "force-dynamic";

export default async function RecepturyPage() {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();

  if (!(await recipeTablesExist())) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-neutral-900">
        <h1 className="text-2xl font-semibold">Receptury a náklady</h1>
        <p className="mt-3 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">Tabulky pro receptury v databázi ještě nejsou. Spusťte v Neonu skript 123_receptury_MAIN.</p>
      </div>
    );
  }

  const { recipes, ingredients } = await loadRecipes();
  const packaging = packagingPrices(ingredients);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 text-neutral-900">
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Receptury a náklady</h1>
        <Link href="/rizeni-firmy/receptury/cenik" className="rounded-lg bg-begina-primary-900 px-4 py-2 text-sm font-medium text-white">
          Ceník surovin a obalů
        </Link>
      </div>
      <p className="mt-2 text-sm text-neutral-600">Přesné složení každého výrobku na 3l beginu, náklad a marže. Ceny surovin se berou z jednoho ceníku — po změně ceny se přepočítá všechno. Marže je po surovinách a obalech; práce, energie, reklama a provize v ní nejsou.</p>
      {recipes.length === 0 && <p className="mt-6 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">Zatím tu není žádná receptura.</p>}

      {RECIPE_CATEGORIES.map((category) => {
        const rows = recipes.filter((recipe) => recipe.category === category.key);
        if (rows.length === 0) return null;
        return (
          <section key={category.key} className="mt-8">
            <h2 className="text-sm font-medium text-begina-primary-900 mb-2">{category.label}</h2>
            <div className="overflow-x-auto bg-white border border-neutral-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
                  <tr>
                    <th className="px-3 py-2 font-medium">Výrobek</th>
                    <th className="px-3 py-2 font-medium text-right">Suroviny na 3 l</th>
                    <th className="px-3 py-2 font-medium">Balení</th>
                    <th className="px-3 py-2 font-medium text-right">Náklad celkem</th>
                    <th className="px-3 py-2 font-medium text-right">Prodejní cena</th>
                    <th className="px-3 py-2 font-medium text-right">Marže</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((recipe) => {
                    const main = recipe.variants[0] ? calcVariant(recipe, recipe.variants[0], packaging) : null;
                    return (
                      <tr key={recipe.slug} className="border-b border-neutral-100 last:border-0">
                        <td className="px-3 py-2">
                          <Link href={`/rizeni-firmy/receptury/${recipe.slug}`} className="font-medium text-begina-primary-900 hover:underline">
                            {recipe.name}
                          </Link>
                          {recipe.archived && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">nevyrábí se</span>}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{formatKcValue(batchCostKc(recipe))}</td>
                        <td className="px-3 py-2 text-neutral-600">{main?.label ?? "—"}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{main ? formatKcValue(main.totalKc) : "—"}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{main?.saleKc != null ? formatKcValue(main.saleKc) : "—"}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                          {main?.marginKc != null && main.marginPct != null ? `${formatKcValue(main.marginKc)} · ${main.marginPct.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
