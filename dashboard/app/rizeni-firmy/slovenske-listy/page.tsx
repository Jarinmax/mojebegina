import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { OPERATOR } from "@/lib/eshop/operator";
import { buildSkSheet, type SkSheetSource } from "@/lib/eshop/skFoodInfo";

// Slovenské informace o potravinách (16. 11. 2026) — k tisku nebo uložení
// do PDF (Cmd+P) pro dodávky na Slovensko. Složení je překlad textu
// z e-shopu; výživové údaje se berou živě z katalogu.
// Autorizaci (ADMIN/EXECUTIVE) řeší app/rizeni-firmy/layout.tsx.
export const dynamic = "force-dynamic";

type Nutrition = { energy_kj?: number; energy_kcal?: number; fat?: number; saturates?: number; carbohydrate?: number; sugars?: number; protein?: number; salt?: number };
type Row = SkSheetSource & { category: string; nutrition: Nutrition | null; nutritionBasis: string | null };

const num = (value: number | undefined) => (value === undefined || value === null ? "—" : value.toLocaleString("sk-SK"));

export default async function SlovenskeListyPage() {
  const result = await db.execute(sql`
    SELECT p.slug, p.name, c.name AS category, p.ingredients, p.allergens, p.nutrition, p.nutrition_basis,
           p.storage_instructions, p.shelf_life_note, p.warnings
    FROM products p JOIN product_categories c ON c.id = p.category_id
    WHERE p.is_active = true
    ORDER BY c.sort_order, p.sort_order, p.name
  `);
  const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item : JSON.stringify(item))) : []);
  const rows: Row[] = (result.rows as Record<string, unknown>[]).map((row) => ({
    slug: String(row.slug),
    name: String(row.name),
    category: String(row.category),
    ingredients: (row.ingredients as string | null) ?? null,
    allergens: row.allergens === null || row.allergens === undefined ? null : asList(row.allergens),
    nutrition: (row.nutrition as Nutrition | null) ?? null,
    nutritionBasis: (row.nutrition_basis as string | null) ?? null,
    storage: (row.storage_instructions as string | null) ?? null,
    shelfLife: (row.shelf_life_note as string | null) ?? null,
    warnings: asList(row.warnings),
  }));
  const sheets = rows.map((row) => ({ row, sheet: buildSkSheet(row) }));
  const ready = sheets.filter((item) => item.sheet.status === "ok");
  const stale = sheets.filter((item) => item.sheet.status === "stale");
  const missing = sheets.filter((item) => item.sheet.status === "missing");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6 text-neutral-900">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold">Slovenské listy k produktům</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Složení, alergeny a výživové údaje ve slovenštině pro dodávky na Slovensko. Vytiskněte nebo uložte jako PDF (Cmd+P) — tiskne se jen část pod čarou. Přeloženo: {ready.length} z {rows.length} produktů.
        </p>
        {stale.length > 0 && (
          <p className="mt-2 text-sm rounded-lg bg-red-50 text-red-800 px-3 py-2">
            Složení v e-shopu se změnilo a překlad už neplatí: {stale.map((item) => item.row.name).join(", ")}. Tyto listy se netisknou, dokud se překlad neopraví.
          </p>
        )}
        {missing.length > 0 && <p className="mt-2 text-xs text-neutral-500">Zatím bez slovenského překladu: {missing.map((item) => item.row.name).join(", ")}.</p>}
      </div>

      <div className="border-t border-neutral-300 pt-6 flex flex-col gap-8 print:border-0 print:pt-0">
        <div>
          <p className="text-xl font-semibold">Begina – informácie o potravinách</p>
          <p className="text-sm">
            Výrobca: {OPERATOR.name}, {OPERATOR.address}, Česká republika · {OPERATOR.email} · www.begina.cz
          </p>
        </div>
        {ready.map(({ row, sheet }) =>
          sheet.status !== "ok" ? null : (
            <section key={row.slug} className="break-inside-avoid text-sm flex flex-col gap-1.5">
              <h2 className="text-lg font-semibold">{sheet.nameSk}</h2>
              {sheet.problems.map((problem) => (
                <p key={problem} className="rounded bg-red-50 text-red-800 px-2 py-1 print:hidden">{problem}</p>
              ))}
              <p><strong>Zloženie:</strong> {sheet.ingredientsSk}</p>
              <p>
                <strong>Alergény:</strong>{" "}
                {row.allergens !== null && row.allergens.length === 0 ? "podľa receptúry neobsahuje žiadnu z látok uvedených v prílohe II nariadenia (EÚ) č. 1169/2011." : "POZOR – alergény nie sú overené alebo preložené, list nepoužívať."}
              </p>
              {row.nutrition && (
                <p>
                  <strong>Výživové údaje na {row.nutritionBasis === "100g" ? "100 g" : "100 ml"}:</strong> energia {num(row.nutrition.energy_kj)} kJ / {num(row.nutrition.energy_kcal)} kcal; tuky {num(row.nutrition.fat)} g, z toho nasýtené mastné kyseliny {num(row.nutrition.saturates)} g; sacharidy {num(row.nutrition.carbohydrate)} g, z toho cukry {num(row.nutrition.sugars)} g; bielkoviny {num(row.nutrition.protein)} g; soľ {num(row.nutrition.salt)} g.
                </p>
              )}
              {sheet.warningsSk.map((warning) => (
                <p key={warning}><strong>Upozornenie:</strong> {warning}</p>
              ))}
              {sheet.storageSk && <p><strong>Skladovanie:</strong> {sheet.storageSk}</p>}
              {sheet.shelfLifeSk && <p><strong>Trvanlivosť:</strong> {sheet.shelfLifeSk}</p>}
            </section>
          ),
        )}
      </div>
    </div>
  );
}
