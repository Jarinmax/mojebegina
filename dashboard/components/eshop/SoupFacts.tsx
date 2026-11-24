// Složení, alergeny a výživové údaje jedné polévky v ochutnávce 3 × 450 ml
// (24. 11. 2026). Data se berou z produktu té polévky (stejné jako na její
// stránce a etiketě). Bez hooků — použije se na serveru i v SoupPackForm.
import { highlightAllergens } from "@/lib/eshop/productFacts";
import type { NutritionTable } from "@/lib/eshop/nutrition";
import { asSentence } from "@/lib/eshop/typography";

export type SoupFactsData = {
  code: string;
  slug: string;
  name: string;
  ingredients: string | null;
  allergens: string[];
  nutrition: NutritionTable | null;
};

export default function SoupFacts({ facts }: { facts: SoupFactsData }) {
  const sentence = asSentence(facts.ingredients);
  return (
    <div className="flex flex-col gap-2 text-sm text-neutral-700">
      {sentence && (
        <p>
          <span className="font-medium text-neutral-900">Složení: </span>
          {highlightAllergens(sentence, facts.allergens).map((segment, index) =>
            segment.bold ? <strong key={index}>{segment.text}</strong> : <span key={index}>{segment.text}</span>
          )}
        </p>
      )}
      {facts.allergens.length > 0 && (
        <p>
          <span className="font-medium text-neutral-900">Alergeny: </span>
          {asSentence(facts.allergens.join(", "))}
        </p>
      )}
      {facts.nutrition && (
        <table className="w-full border-collapse text-left">
          <caption className="text-left font-medium text-neutral-900 pb-1">Výživové údaje na {facts.nutrition.basis}</caption>
          <tbody className="divide-y divide-neutral-100">
            {facts.nutrition.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className={`py-1.5 pr-3 font-normal ${row.sub ? "pl-4" : ""}`}>{row.label}</th>
                <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
