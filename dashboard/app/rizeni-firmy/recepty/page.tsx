import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { RECIPE_CATEGORIES } from "@/lib/receptury/recipes";
import { loadRecipes, recipeTablesExist } from "@/lib/receptury/recipesServer";

// RECEPTY pro výrobu (Lucie 27. 11. 2026): jen co a kolik — žádné ceny, náklady
// ani marže (ty jsou zvlášť v Náklady a marže). Přístup zatím stejný jako
// u nákladů: jen Jaroslav a Lucie.
export const dynamic = "force-dynamic";

export default async function ReceptyPage({ searchParams }: { searchParams: Promise<{ kat?: string | string[] }> }) {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  if (!(await recipeTablesExist())) notFound();
  const sp = await searchParams;
  const katParam = Array.isArray(sp.kat) ? sp.kat[0] : sp.kat;

  const { recipes } = await loadRecipes();
  const active = recipes.filter((recipe) => !recipe.archived);
  const categories = RECIPE_CATEGORIES.map((c) => ({ ...c, rows: active.filter((r) => r.category === c.key) })).filter((c) => c.rows.length > 0);
  const current = categories.find((c) => c.key === katParam) ?? categories[0];

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 text-neutral-900">
      <h1 className="text-2xl font-semibold">Recepty</h1>
      <p className="mt-1 text-sm text-neutral-600">Vyber výrobek – otevře se recept na 1 beginu (3 l), počet begin si přepneš.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link
            key={c.key}
            href={`/rizeni-firmy/recepty?kat=${c.key}`}
            className={
              "px-3 py-1.5 rounded-full text-sm font-medium border " +
              (c.key === current?.key ? "bg-begina-primary-900 text-white border-begina-primary-900" : "bg-white text-begina-primary-900 border-neutral-300 hover:border-begina-primary-900")
            }
          >
            {c.label}
          </Link>
        ))}
      </div>
      {current && (
        <ul className="mt-4 bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
          {current.rows.map((recipe) => (
            <li key={recipe.slug}>
              <Link href={`/rizeni-firmy/recepty/${recipe.slug}`} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px] font-medium text-begina-primary-900 hover:bg-begina-primary-50">
                <span>{recipe.name}</span>
                <span aria-hidden className="text-neutral-400 text-lg">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
