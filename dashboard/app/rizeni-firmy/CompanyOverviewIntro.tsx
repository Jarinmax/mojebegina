import EshopLink from "@/components/EshopLink";
import { formatCzechDate } from "@/lib/format";
import { isEshopPublic } from "@/lib/eshop/storeMode";

// Úvod stránky Řízení firmy: nadpis + viditelné tlačítko do e-shopu
// (cíl odkazu určuje lib/eshopLink.ts). Skrytý e-shop (Production před
// spuštěním, viz lib/eshop/storeMode.ts) = bez tlačítka.
export default function CompanyOverviewIntro({ lastUpdated }: { lastUpdated: Date }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-lg font-medium text-begina-primary-900">Řízení firmy</h1>
        <p className="text-sm text-neutral-500 mt-0.5">Struktura, strategie a systém řízení Beginy</p>
        <p className="text-xs text-neutral-400 mt-1">Aktualizováno: {formatCzechDate(lastUpdated)}</p>
      </div>
      {isEshopPublic() && (
        <div className="sm:w-56 shrink-0">
          <EshopLink label="E-shop Begina.cz" />
        </div>
      )}
    </div>
  );
}
