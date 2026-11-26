import { IngredientChecklist } from "./IngredientChecklist";
import { formatKcValue, formatUnitPrice, itemCostKc, priceUnitLabel, type RecipeItem } from "@/lib/receptury/recipes";

// Výrobní pohled (Lucie 27. 11. 2026): množství hned vedle suroviny, na počítači
// ve dvou sloupcích, ať se celá receptura vejde na obrazovku bez posouvání.
// Ceny a náklady surovin jsou sbalené pod tlačítkem — při výrobě nejsou potřeba.
export function IngredientList({ storageKey, items, count, batchCostKc }: { storageKey: string; items: RecipeItem[]; count: number; batchCostKc: number }) {
  return (
    <>
      <IngredientChecklist storageKey={storageKey} items={items} count={count} />
      <details className="mt-3 group">
        <summary className="cursor-pointer select-none text-sm text-begina-primary-900 hover:underline">
          Náklady surovin <span className="text-neutral-500">· celkem {formatKcValue(batchCostKc * count)}</span>
        </summary>
        <div className="mt-2 overflow-x-auto bg-white border border-neutral-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="px-3 py-2 font-medium">Surovina</th>
                <th className="px-3 py-2 font-medium text-right">Cena v ceníku</th>
                <th className="px-3 py-2 font-medium text-right">Náklad</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b border-neutral-100 last:border-0">
                  <td className="px-3 py-1.5">{item.ingredient.name}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap text-neutral-600">
                    {formatUnitPrice(item.ingredient.priceKc)} {priceUnitLabel(item.ingredient.priceUnit)}
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatKcValue(itemCostKc(item) * count)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-200 font-medium">
                <td className="px-3 py-2" colSpan={2}>Suroviny celkem</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatKcValue(batchCostKc * count)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </>
  );
}
