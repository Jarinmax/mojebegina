import Link from "next/link";
import { BatchPicker } from "@/app/rizeni-firmy/recepty/BatchPicker";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { RECIPE_CATEGORIES, beginLabel, parseBatchCount } from "@/lib/receptury/recipes";
import { loadRecipes, recipeTablesExist } from "@/lib/receptury/recipesServer";
import { IngredientChecklist, StepsChecklist, type ProductionItem } from "./IngredientChecklist";

// RECEPT pro výrobu (Lucie 27. 11. 2026): množství hned u suroviny, na počítači
// ve dvou sloupcích (vejde se bez posouvání), odškrtávání klepnutím. Žádné ceny.
export const dynamic = "force-dynamic";


export default async function ReceptPage(props: PageProps<"/rizeni-firmy/recepty/[slug]">) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  if (!(await recipeTablesExist())) notFound();

  const { slug } = await props.params;
  const searchParams = await props.searchParams;
  const count = parseBatchCount(typeof searchParams.beginy === "string" ? searchParams.beginy : undefined);
  const { recipes } = await loadRecipes();
  const recipe = recipes.find((item) => item.slug === slug);
  if (!recipe) notFound();

  const base = `/rizeni-firmy/recepty/${recipe.slug}`;
  const category = RECIPE_CATEGORIES.find((item) => item.key === recipe.category)?.label ?? recipe.category;
  const litres = ((recipe.batchMl * count) / 1000).toLocaleString("cs-CZ");
  const items: ProductionItem[] = recipe.items.map((item) => ({ name: item.ingredient.name, quantity: item.quantity, unit: item.unit }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 text-neutral-900">
      <Link href={`/rizeni-firmy/recepty?kat=${recipe.category}`} className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Recepty · {category}
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">{recipe.name}</h1>
      {recipe.archived && <p className="mt-2 inline-block rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700">Nevyrábí se — archivní receptura</p>}
      {recipe.note && <p className="mt-2 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">{recipe.note}</p>}

      <div className="mt-3 mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-begina-primary-900">
          Na {beginLabel(count)} ({litres} l)
        </h2>
        <BatchPicker base={base} count={count} />
      </div>
      <IngredientChecklist storageKey={recipe.slug} items={items} count={count} />
      {/* Postup a kontrolní body z výrobních karet (Lucie 27. 11. 2026) */}
      {(recipe.procedureSteps?.length ?? 0) > 0 && (
        <section className="mt-6 grid gap-6 md:grid-cols-[2fr_1fr]">
          <div>
            <h2 className="text-lg font-semibold">Postup</h2>
            <div className="mt-2">
              <StepsChecklist storageKey={recipe.slug} steps={recipe.procedureSteps!} />
            </div>
          </div>
          {(recipe.procedureChecks?.length ?? 0) > 0 && (
            <div className="self-start rounded-lg bg-amber-50 px-4 py-3 text-amber-950">
              <h2 className="text-lg font-semibold">Kontrolní body</h2>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                {recipe.procedureChecks!.map((check, index) => (
                  <li key={index}>{check}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
