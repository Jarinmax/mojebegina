import Link from "next/link";
import { BatchPicker } from "@/app/rizeni-firmy/recepty/BatchPicker";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { RECIPE_CATEGORIES, beginLabel, batchCostKc, calcVariant, formatKcValue, formatQuantity, formatUnitPrice, itemCostKc, parseBatchCount, priceUnitLabel } from "@/lib/receptury/recipes";
import { loadRecipes, packagingPrices, recipeTablesExist } from "@/lib/receptury/recipesServer";

// NÁKLADY A MARŽE (dřív Receptury a náklady; recept pro výrobu je od 27. 11. 2026
// zvlášť v /rizeni-firmy/recepty) — jedna receptura: přesné složení na zvolený počet
// 3l begin, náklad surovin a kalkulace všech balení. Jen Jaroslav a Lucie.
export const dynamic = "force-dynamic";


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
  const category = RECIPE_CATEGORIES.find((item) => item.key === recipe.category)?.label ?? recipe.category;

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 text-neutral-900">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{category} · náklady a marže</p>
      <h1 className="text-2xl font-semibold">{recipe.name}</h1>
      <Link href={`/rizeni-firmy/recepty/${recipe.slug}`} className="mt-1 inline-block text-sm text-begina-primary-900 hover:underline">
        🥣 Recept pro výrobu (bez cen) →
      </Link>
      {recipe.archived && <p className="mt-2 inline-block rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700">Nevyrábí se — archivní receptura</p>}
      {recipe.note && <p className="mt-3 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">{recipe.note}</p>}

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-medium text-begina-primary-900">
            Složení na {beginLabel(count)} ({((recipe.batchMl * count) / 1000).toLocaleString("cs-CZ")} l)
          </h2>
          <BatchPicker base={base} count={count} />
        </div>
        {/* Mobil (19. 11. 2026, Lucie): surovina a množství na jednom řádku, ceny pod tím. */}
        <ul className="sm:hidden bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
          {recipe.items.map((item, index) => (
            <li key={index} className="px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words text-[15px] text-neutral-900">{item.ingredient.name}</span>
                <span className="whitespace-nowrap text-[15px] font-semibold text-neutral-900">{formatQuantity(item.quantity * count, item.unit)}</span>
              </div>
              <div className="text-xs text-neutral-500">
                {formatUnitPrice(item.ingredient.priceKc)} {priceUnitLabel(item.ingredient.priceUnit)} · náklad {formatKcValue(itemCostKc(item) * count)}
              </div>
            </li>
          ))}
          <li className="px-3 py-2.5 flex justify-between font-medium text-neutral-900">
            <span>Suroviny celkem</span>
            <span className="whitespace-nowrap">{formatKcValue(batchCost * count)}</span>
          </li>
        </ul>
        <div className="hidden sm:block overflow-x-auto bg-white border border-neutral-200 rounded-xl">
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
        <div className="sm:hidden flex flex-col gap-2">
          {recipe.variants.map((variant, index) => {
            const calc = calcVariant(recipe, variant, packaging);
            return (
              <div key={index} className="bg-white border border-neutral-200 rounded-xl px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-neutral-900">{variant.label}</span>
                  <span className="whitespace-nowrap font-semibold text-neutral-900">
                    {calc.marginKc !== null && calc.marginPct !== null ? `${calc.marginPct.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %` : ""}
                  </span>
                </div>
                <div className="text-xs text-neutral-500 break-words">{variant.packagingCodes.map((code) => packagingNames.get(code) ?? `${code} (chybí v ceníku)`).join(" + ")}</div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
                  <dt className="text-neutral-500">Obsah</dt><dd className="text-right">{formatKcValue(calc.contentKc)}</dd>
                  <dt className="text-neutral-500">Obal a etiketa</dt><dd className="text-right">{formatKcValue(calc.packagingKc)}</dd>
                  <dt className="text-neutral-500">Náklad celkem</dt><dd className="text-right font-medium">{formatKcValue(calc.totalKc)}</dd>
                  <dt className="text-neutral-500">Prodejní cena</dt><dd className="text-right">{calc.saleKc !== null ? formatKcValue(calc.saleKc) : "neprodává se"}</dd>
                  {calc.marginKc !== null && (<><dt className="text-neutral-500">Marže</dt><dd className="text-right font-medium">{formatKcValue(calc.marginKc)}</dd></>)}
                </dl>
              </div>
            );
          })}
        </div>
        <div className="hidden sm:block overflow-x-auto bg-white border border-neutral-200 rounded-xl">
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
