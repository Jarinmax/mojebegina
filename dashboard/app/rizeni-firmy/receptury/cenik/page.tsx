import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { formatUnitPrice, priceUnitLabel, type RecipeIngredient } from "@/lib/receptury/recipes";
import { loadRecipes, recipeTablesExist } from "@/lib/receptury/recipesServer";
import PriceRow from "./PriceRow";

// RECEPTURY A NÁKLADY 1.0 — ceník surovin a obalů. Jedna cena pro všechny
// receptury; po uložení se náklady a marže přepočítají všude.
export const dynamic = "force-dynamic";

export default async function CenikSurovinPage() {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) notFound();
  if (!(await recipeTablesExist())) notFound();

  const { recipes, ingredients } = await loadRecipes();
  const usage = new Map<string, number>();
  for (const recipe of recipes) for (const id of new Set(recipe.items.map((item) => item.ingredient.id))) usage.set(id, (usage.get(id) ?? 0) + 1);

  const section = (title: string, rows: RecipeIngredient[], withUsage: boolean) => (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-begina-primary-900 mb-2">{title}</h2>
      <div className="bg-white border border-neutral-200 rounded-xl">
        {rows.map((row) => (
          <PriceRow key={row.id} id={row.id} name={row.name} unitLabel={priceUnitLabel(row.priceUnit)} price={formatUnitPrice(row.priceKc)} note={row.note ?? ""} usedIn={withUsage ? (usage.get(row.id) ?? 0) : null} />
        ))}
      </div>
    </section>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 text-neutral-900">
      <h1 className="mt-2 text-2xl font-semibold">Ceník surovin a obalů</h1>
      <p className="mt-2 text-sm text-neutral-600">Když nakoupíte za jinou cenu, přepište ji tady a uložte. Náklady a marže se přepočítají u všech receptur, kde se surovina nebo obal používá. Cena je včetně dopravy, pokud ji tak počítáte.</p>
      {section("Obaly a etikety", ingredients.filter((item) => item.kind === "obal"), false)}
      {section("Suroviny", ingredients.filter((item) => item.kind === "surovina"), true)}
    </div>
  );
}
