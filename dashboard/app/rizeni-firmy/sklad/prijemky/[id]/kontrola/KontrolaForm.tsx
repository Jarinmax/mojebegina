"use client";

// Mobilní tok 1.0 — kontrolní obrazovka (bod 10 zadání): oprava hodnot,
// potvrzení DPH, potvrzení/oprava mapování na skladovou kartu. Po KAŽDÉ
// akci se zavolá router.refresh() — data vždy znovu přijdou ze serveru
// (page.tsx), tahle komponenta si sama nic netrvale nepamatuje, jen která
// karta je zrovna rozbalená. Stejný princip jako NacistUdajeButton.
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  confirmGoodsReceiptLineMappingAction,
  createStockItemForReceiptAction,
  reviewGoodsReceiptLineVatAction,
  updateGoodsReceiptLineAction,
} from "../../../actions";
import type { GoodsReceiptLineRow, StockItemSummary } from "@/lib/data/sklad";
import type { ExtractionSuggestion } from "@/lib/data/skladExtraction";

const CATEGORY_LABELS: Record<string, string> = {
  stock_material: "Skladová surovina",
  resale_goods: "Zboží k prodeji",
  operating_supply: "Provozní spotřeba",
  non_stock_private: "Soukromý nákup",
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS);

function halToKc(hal: number): string {
  return (hal / 100).toFixed(2);
}

export default function KontrolaForm({
  receiptId,
  lines,
  suggestions,
  stockItems,
}: {
  receiptId: string;
  lines: GoodsReceiptLineRow[];
  suggestions: ExtractionSuggestion[];
  stockItems: StockItemSummary[];
}) {
  const router = useRouter();
  const allConfirmed = lines.every((line) => line.vatConfirmed && (line.stockItemId || line.lineKind === "non_stock_private"));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {lines.map((line) => (
          <LineReviewCard
            key={line.id}
            receiptId={receiptId}
            line={line}
            suggestion={suggestions.find((s) => s.position === line.position)?.suggestion ?? null}
            stockItems={stockItems}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        {allConfirmed ? (
          <p className="text-sm text-green-700">Všechny řádky mají potvrzené DPH i mapování. Hotovo — příjemku můžete potvrdit.</p>
        ) : (
          <p className="text-sm text-neutral-500">
            Zbývá potvrdit DPH a/nebo mapování u {lines.filter((l) => !(l.vatConfirmed && (l.stockItemId || l.lineKind === "non_stock_private"))).length}{" "}
            z {lines.length} řádků.
          </p>
        )}
      </div>
    </div>
  );
}

function LineReviewCard({
  receiptId,
  line,
  suggestion,
  stockItems,
  onChanged,
}: {
  receiptId: string;
  line: GoodsReceiptLineRow;
  suggestion: ExtractionSuggestion["suggestion"];
  stockItems: StockItemSummary[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const stockItemName = stockItems.find((item) => item.id === line.stockItemId)?.name ?? null;
  const isMapped = Boolean(line.stockItemId) || line.lineKind === "non_stock_private";

  async function handleUpdate(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await updateGoodsReceiptLineAction(receiptId, line.id, {
      rawDescription: String(formData.get("rawDescription") ?? ""),
      supplierItemCode: String(formData.get("supplierItemCode") ?? ""),
      supplierAuxiliaryCode: String(formData.get("supplierAuxiliaryCode") ?? ""),
      rawPackageQuantity: String(formData.get("rawPackageQuantity") ?? ""),
      rawUnitsPerPackage: String(formData.get("rawUnitsPerPackage") ?? ""),
      rawUnit: String(formData.get("rawUnit") ?? ""),
      normalizedUnit: String(formData.get("normalizedUnit") ?? ""),
      unitPriceWithoutVat: String(formData.get("unitPriceWithoutVat") ?? ""),
      totalWithoutVatHal: String(formData.get("totalWithoutVat") ?? ""),
      totalWithVatHal: String(formData.get("totalWithVat") ?? ""),
      lineKind: line.lineKind,
      stockItemId: line.stockItemId ?? "",
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function handleConfirmVat(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await reviewGoodsReceiptLineVatAction(receiptId, line.id, {
      totalWithoutVatHal: String(formData.get("vatTotalWithoutVat") ?? ""),
      totalWithVatHal: String(formData.get("vatTotalWithVat") ?? ""),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged();
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-begina-primary-900">{line.rawDescription}</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {line.normalizedQuantity} {line.normalizedUnit} · {line.unitPriceWithoutVat.toFixed(2)} Kč/ks bez DPH
          </p>
          <p className="text-xs text-neutral-500">
            {halToKc(line.totalWithoutVatHal)} Kč bez DPH · {halToKc(line.vatHal)} Kč DPH ({line.computedVatRatePercent} %) ·{" "}
            {halToKc(line.totalWithVatHal)} Kč s DPH
          </p>
        </div>
        <button type="button" onClick={() => setEditing((v) => !v)} className="text-xs text-begina-primary-900 underline shrink-0">
          {editing ? "Zrušit" : "Upravit"}
        </button>
      </div>

      {editing && (
        <form
          action={handleUpdate}
          className="mt-3 border-t border-neutral-200 pt-3 flex flex-col gap-2"
        >
          <label className="text-xs text-neutral-500">
            Popis
            <input name="rawDescription" defaultValue={line.rawDescription} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-neutral-500">
              Dodavatelský kód
              <input name="supplierItemCode" defaultValue={line.supplierItemCode ?? ""} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
            </label>
            <label className="text-xs text-neutral-500">
              Pomocný kód
              <input name="supplierAuxiliaryCode" defaultValue={line.supplierAuxiliaryCode ?? ""} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-neutral-500">
              Počet balení
              <input name="rawPackageQuantity" defaultValue={line.rawPackageQuantity} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
            </label>
            <label className="text-xs text-neutral-500">
              Kusů v balení
              <input name="rawUnitsPerPackage" defaultValue={line.rawUnitsPerPackage} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
            </label>
            <label className="text-xs text-neutral-500">
              Jednotka
              <input name="rawUnit" defaultValue={line.rawUnit} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
            </label>
          </div>
          <label className="text-xs text-neutral-500">
            Kanonická jednotka
            <input name="normalizedUnit" defaultValue={line.normalizedUnit} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-neutral-500">
              Jedn. cena bez DPH
              <input name="unitPriceWithoutVat" defaultValue={line.unitPriceWithoutVat} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
            </label>
            <label className="text-xs text-neutral-500">
              Celkem bez DPH
              <input name="totalWithoutVat" defaultValue={halToKc(line.totalWithoutVatHal)} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
            </label>
            <label className="text-xs text-neutral-500">
              Celkem s DPH
              <input name="totalWithVat" defaultValue={halToKc(line.totalWithVatHal)} className="w-full mt-0.5 px-2 py-1.5 border border-neutral-200 rounded text-sm" />
            </label>
          </div>
          <button type="submit" disabled={pending} className="text-sm font-medium text-begina-primary-50 bg-begina-primary-900 rounded-lg px-4 py-2 disabled:opacity-50">
            {pending ? "Ukládám…" : "Uložit opravu"}
          </button>
        </form>
      )}

      <div className="mt-3 border-t border-neutral-200 pt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {line.vatConfirmed ? (
          <p className="text-xs text-green-700">✓ DPH potvrzeno</p>
        ) : (
          <form action={handleConfirmVat} className="flex flex-wrap items-center gap-1.5">
            <input name="vatTotalWithoutVat" defaultValue={halToKc(line.totalWithoutVatHal)} className="w-20 px-1.5 py-1 border border-neutral-200 rounded text-xs" />
            <span className="text-xs text-neutral-400">bez DPH /</span>
            <input name="vatTotalWithVat" defaultValue={halToKc(line.totalWithVatHal)} className="w-20 px-1.5 py-1 border border-neutral-200 rounded text-xs" />
            <span className="text-xs text-neutral-400">s DPH</span>
            <button type="submit" disabled={pending} className="text-xs font-medium text-begina-primary-50 bg-begina-primary-900 rounded px-2.5 py-1 disabled:opacity-50">
              Potvrdit DPH
            </button>
          </form>
        )}

        {isMapped && !mapping ? (
          <div className="flex items-center gap-2">
            <p className="text-xs text-green-700">
              ✓ {line.lineKind === "non_stock_private" ? "Soukromý nákup" : `${CATEGORY_LABELS[line.lineKind]}: ${stockItemName ?? "?"}`}
            </p>
            <button type="button" onClick={() => setMapping(true)} className="text-xs text-begina-primary-900 underline">
              Změnit
            </button>
          </div>
        ) : (
          <MappingForm
            receiptId={receiptId}
            line={line}
            suggestion={suggestion}
            stockItems={stockItems}
            onCancel={isMapped ? () => setMapping(false) : undefined}
            onChanged={() => {
              setMapping(false);
              onChanged();
            }}
          />
        )}
      </div>

      {error && <p className="text-sm text-begina-accent-700 mt-2">{error}</p>}
    </div>
  );
}

function MappingForm({
  receiptId,
  line,
  suggestion,
  stockItems,
  onCancel,
  onChanged,
}: {
  receiptId: string;
  line: GoodsReceiptLineRow;
  suggestion: ExtractionSuggestion["suggestion"];
  stockItems: StockItemSummary[];
  onCancel?: () => void;
  onChanged: () => void;
}) {
  const [category, setCategory] = useState(suggestion?.category ?? line.lineKind);
  const [stockItemId, setStockItemId] = useState(line.stockItemId ?? "");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newItemName, setNewItemName] = useState(suggestion?.stockItemName ?? "");
  const [newItemUnit, setNewItemUnit] = useState(suggestion?.canonicalUnit ?? "");
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      let finalStockItemId: string | null = stockItemId || null;
      if (category !== "non_stock_private" && creatingNew) {
        const created = await createStockItemForReceiptAction({
          name: newItemName,
          canonicalUnit: newItemUnit,
          kind: category,
        });
        if (!created.ok) {
          setError(created.error);
          return;
        }
        finalStockItemId = created.stockItemId;
      }
      if (category === "non_stock_private") {
        finalStockItemId = null;
      }
      const result = await confirmGoodsReceiptLineMappingAction(receiptId, line.id, {
        stockItemId: finalStockItemId,
        lineKind: category,
        rememberMapping: remember,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 w-full sm:w-auto">
      {suggestion && (
        <p className="text-xs text-neutral-400">
          Návrh AI: {CATEGORY_LABELS[suggestion.category] ?? suggestion.category}
          {suggestion.stockItemName ? ` — ${suggestion.stockItemName}` : ""}
        </p>
      )}
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="text-xs px-1.5 py-1 border border-neutral-200 rounded">
        {CATEGORY_OPTIONS.map((kind) => (
          <option key={kind} value={kind}>
            {CATEGORY_LABELS[kind]}
          </option>
        ))}
      </select>

      {category !== "non_stock_private" &&
        (creatingNew ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Název skladové karty"
              className="w-32 px-1.5 py-1 border border-neutral-200 rounded text-xs"
            />
            <input
              value={newItemUnit}
              onChange={(e) => setNewItemUnit(e.target.value)}
              placeholder="jednotka (l, kg, ks…)"
              className="w-24 px-1.5 py-1 border border-neutral-200 rounded text-xs"
            />
            <button type="button" onClick={() => setCreatingNew(false)} className="text-xs text-neutral-500 underline">
              existující kartu
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={stockItemId} onChange={(e) => setStockItemId(e.target.value)} className="text-xs px-1.5 py-1 border border-neutral-200 rounded">
              <option value="">Vyberte skladovou kartu…</option>
              {stockItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setCreatingNew(true)} className="text-xs text-begina-primary-900 underline">
              + nová karta
            </button>
          </div>
        ))}

      <label className="text-xs text-neutral-500 flex items-center gap-1">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        zapamatovat mapování pro příště
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={handleConfirm}
          className="text-xs font-medium text-begina-primary-50 bg-begina-primary-900 rounded px-2.5 py-1 disabled:opacity-50"
        >
          Potvrdit mapování
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-xs text-neutral-500 underline">
            Zrušit
          </button>
        )}
      </div>
      {error && <p className="text-xs text-begina-accent-700">{error}</p>}
    </div>
  );
}
