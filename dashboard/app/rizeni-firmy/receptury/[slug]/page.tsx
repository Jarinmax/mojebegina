import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { RECIPE_CATEGORIES, batchCostKc, calcVariant, formatKcValue, formatQuantity, formatUnitPrice, itemCostKc, parseBatchCount, priceUnitLabel } from "@/lib/receptury/recipes";
import { loadRecipes, packagingPrices, recipeTablesExist } from "@/lib/receptury/recipesServer";

// RECEPTURY A NÁKLADY 1.0 — jedna receptura: přesné složení na zvolený počet
// 3l begin, náklad surovin a kalkulace všech balení. Jen Jaroslav a Lucie.
export const dynamic = "force-dynamic";

const BATCH_CHOICES = [1, 2, 3, 5, 10];

export default async function RecepturaPage(props: PageProps<"/rizeni-firmy/receptury/[slug]">) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  if (!(await recipeTablesExist())) notFound();

  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const count = parseBatchCount(typeof searchParams.beginy === "string" ? searchParams.beginy : undefined);

  const { recipes, ingredients } = await loadRecipes();
  const recipe = recipes.find((item) => item.slug === slug);
  if (!recipe) notFound();
  const packaging = packagingPrices(ingredients);
  const packagingNames = new Map(ingredients.filter((item) => item.kind === "obal").map((item) => [item.code, item.name]));
  const base = `/rizeni-firmy/receptury/${recipe.slug}`;
  const batchCost = batchCostKc(recipe);
  const batchLitres = (recipe.batchMl / 1000).toLocaleString("cs-CZ");
  const category = RECIPE_CATEGORIES.find((item) => item.key === recipe.category)?.label ?? recipe.category;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 text-neutral-900">
      <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">{category}</p>
      <h1 className="text-2xl font-semibold">{recipe.name}</h1>
      {recipe.archived && <p className="mt-2 inline-block rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700">Nevyrábí se — archivní receptura</p>}
      {recipe.note && <p className="mt-3 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">{recipe.note}</p>}

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-medium text-begina-primary-900">
            Složení na {count === 1 ? `1 beginu (${batchLitres} l)` : `${count} begin (${((recipe.batchMl * count) / 1000).toLocaleString("cs-CZ")} l)`}
          </h2>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <span className="text-neutral-500 mr-1">Počet begin:</span>
            {BATCH_CHOICES.map((choice) => (
              <Link
                key={choice}
                href={choice === 1 ? base : `${base}?beginy=${choice}`}
                className={`rounded-md border px-2.5 py-1 ${choice === count ? "border-begina-primary-900 bg-begina-primary-900 text-white" : "border-neutral-300 bg-white text-neutral-900 hover:border-begina-primary-300"}`}
              >
                {choice}
              </Link>
            ))}
            <form action={base} className="flex items-center gap-1">
              <input name="beginy" type="number" min={1} max={200} defaultValue={BATCH_CHOICES.includes(count) ? "" : count} placeholder="jiný" aria-label="Jiný počet begin" className="w-16 rounded-md border border-neutral-300 bg-white px-2 py-1 text-neutral-900" />
              <button type="submit" className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-neutral-900">
                Přepočítat
              </button>
            </form>
          </div>
        </div>
        <div className="overflow-x-auto bg-white border border-neutral-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="px-3 py-2 font-medium">Surovina</th>
                <th className="px-3 py-2 font-medium text-right">Množství</th>
                <th className="px-3 py-2 font-medium text-right">Cena v ceníku</th>
                <th className="px-3 py-2 font-medium text-right">Náklad</th>
              </tr>
            </thead>
            <tbody>
              {recipe.items.map((item, index) => (
                <tr key={index} className="border-b border-neutral-100 last:border-0">
                  <td className="px-3 py-2">{item.ingredient.name}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{formatQuantity(item.quantity * count, item.unit)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-neutral-600">
                    {formatUnitPrice(item.ingredient.priceKc)} {priceUnitLabel(item.ingredient.priceUnit)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatKcValue(itemCostKc(item) * count)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-200 font-medium">
                <td className="px-3 py-2" colSpan={3}>
                  Suroviny celkem
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatKcValue(batchCost * count)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Kalkulace balení (na 1 kus)</h2>
        <div className="overflow-x-auto bg-white border border-neutral-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="px-3 py-2 font-medium">Balení</th>
                <th className="px-3 py-2 font-medium text-right">Obsah</th>
                <th className="px-3 py-2 font-medium text-right">Obal a etiketa</th>
                <th className="px-3 py-2 font-medium text-right">Náklad celkem</th>
                <th className="px-3 py-2 font-medium text-right">Prodejní cena</th>
                <th className="px-3 py-2 font-medium text-right">Marže</th>
              </tr>
            </thead>
            <tbody>
              {recipe.variants.map((variant, index) => {
                const calc = calcVariant(recipe, variant, packaging);
                return (
                  <tr key={index} className="border-b border-neutral-100 last:border-0 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{variant.label}</div>
                      <div className="text-xs text-neutral-500">{variant.packagingCodes.map((code) => packagingNames.get(code) ?? `${code} (chybí v ceníku)`).join(" + ")}</div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatKcValue(calc.contentKc)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatKcValue(calc.packagingKc)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{formatKcValue(calc.totalKc)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{calc.saleKc !== null ? formatKcValue(calc.saleKc) : <span className="text-neutral-400">neprodává se</span>}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-medium">
                      {calc.marginKc !== null && calc.marginPct !== null ? `${formatKcValue(calc.marginKc)} · ${calc.marginPct.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Marže je po surovinách a obalech. Práce, energie, reklama a provize v ní nejsou. Ceny měníte v ceníku surovin a obalů.</p>
      </section>
    </div>
  );
}
