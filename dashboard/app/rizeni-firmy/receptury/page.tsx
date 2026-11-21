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

export default async function RecepturyPage({ searchParams }: { searchParams: Promise<{ kat?: string | string[] }> }) {
  const sp = await searchParams;
  const katParam = Array.isArray(sp.kat) ? sp.kat[0] : sp.kat;
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
      <h1 className="mt-2 text-2xl font-semibold">Receptury a náklady</h1>
      <p className="mt-2 text-sm text-neutral-600">Přesné složení každého výrobku na 3l beginu, náklad a marže. Ceny surovin se berou z jednoho ceníku — po změně ceny se přepočítá všechno. Marže je po surovinách a obalech; práce, energie, reklama a provize v ní nejsou.</p>
      {/* 21. 11. 2026 (Lucie): ceník už ne jako černé tlačítko vpravo nahoře, ale
          jako samostatný, jinak označený blok — je to podklad pro všechny receptury. */}
      <Link
        href="/rizeni-firmy/receptury/cenik"
        className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 hover:border-amber-400"
      >
        <span className="text-2xl" aria-hidden>🧾</span>
        <span className="flex-1">
          <span className="block text-base font-medium text-begina-primary-900">Ceník surovin a obalů</span>
          <span className="block text-xs text-neutral-600">Tady se mění ceny surovin a obalů — receptury se podle nich přepočítají samy.</span>
        </span>
        <span className="text-sm text-neutral-500">→</span>
      </Link>
      {recipes.length === 0 && <p className="mt-6 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">Zatím tu není žádná receptura.</p>}

      {/* 17. 11. 2026 (Lucie): nejdřív vybrat kategorii, pak vidět jen její výrobky — bez scrollování. */}
      {(() => {
        const available = RECIPE_CATEGORIES.map((c) => ({ ...c, count: recipes.filter((r) => r.category === c.key).length })).filter((c) => c.count > 0);
        const active = available.find((c) => c.key === katParam) ?? null;
        if (!active) {
          return (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {available.map((c) => (
                <Link
                  key={c.key}
                  href={`/rizeni-firmy/receptury?kat=${c.key}`}
                  className="flex flex-col justify-center min-h-20 rounded-xl border border-neutral-200 bg-white px-4 py-3 hover:border-begina-primary-900"
                >
                  <span className="text-base font-medium text-begina-primary-900">{c.label}</span>
                  <span className="mt-0.5 text-xs text-neutral-500">{c.count} {c.count === 1 ? "výrobek" : c.count <= 4 ? "výrobky" : "výrobků"}</span>
                </Link>
              ))}
            </div>
          );
        }
        return (
          <div className="mt-6 flex flex-wrap gap-2">
            {available.map((c) => (
              <Link
                key={c.key}
                href={`/rizeni-firmy/receptury?kat=${c.key}`}
                className={
                  "px-3 py-1.5 rounded-full text-sm font-medium border " +
                  (c.key === active.key
                    ? "bg-begina-primary-900 text-white border-begina-primary-900"
                    : "bg-white text-begina-primary-900 border-neutral-300 hover:border-begina-primary-900")
                }
              >
                {c.label}
              </Link>
            ))}
          </div>
        );
      })()}

      {RECIPE_CATEGORIES.filter((category) => category.key === katParam).map((category) => {
        const rows = recipes.filter((recipe) => recipe.category === category.key);
        if (rows.length === 0) return null;
        return (
          <section key={category.key} className="mt-5">
            <h2 className="text-sm font-medium text-begina-primary-900 mb-2">{category.label}</h2>
            {/* Mobil (19. 11. 2026, Lucie): karta za výrobek místo široké tabulky. */}
            <ul className="sm:hidden bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
              {rows.map((recipe) => {
                const main = recipe.variants[0] ? calcVariant(recipe, recipe.variants[0], packaging) : null;
                return (
                  <li key={recipe.slug}>
                    <Link href={`/rizeni-firmy/receptury/${recipe.slug}`} className="flex items-center gap-3 px-3 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium text-begina-primary-900 break-words">
                          {recipe.name}
                          {recipe.archived && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-normal text-neutral-600">nevyrábí se</span>}
                        </span>
                        <span className="block text-xs text-neutral-600">
                          náklad {main ? formatKcValue(main.totalKc) : "—"} · prodej {main?.saleKc != null ? formatKcValue(main.saleKc) : "—"}
                        </span>
                        <span className="block text-xs text-neutral-500">{main?.label ?? ""}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold text-neutral-900 whitespace-nowrap">{main?.marginPct != null ? `${main.marginPct.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %` : "—"}</span>
                        <span className="block text-xs text-neutral-500 whitespace-nowrap">{main?.marginKc != null ? formatKcValue(main.marginKc) : ""}</span>
                      </span>
                      <span aria-hidden className="text-neutral-400 text-lg">›</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="hidden sm:block overflow-x-auto bg-white border border-neutral-200 rounded-xl">
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
