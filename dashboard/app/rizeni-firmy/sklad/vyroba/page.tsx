import Link from "next/link";
import { listStockItems, listStockLocations } from "@/lib/data/sklad";
import { listResponsiblePersonOptions } from "@/lib/data/skladFinishedGoods";
import VyrobaForm from "./VyrobaForm";

export default async function VyrobaPage(props: PageProps<"/rizeni-firmy/sklad/vyroba">) {
  const searchParams = await props.searchParams;
  const hotovoParam = Array.isArray(searchParams.hotovo) ? searchParams.hotovo[0] : searchParams.hotovo;

  const [stockItems, stockLocations, responsiblePeople] = await Promise.all([
    listStockItems(),
    listStockLocations(),
    listResponsiblePersonOptions(),
  ]);
  const finishedGoods = stockItems.filter((item) => item.kind === "finished_good");

  return (
    <div>
      <Link href="/rizeni-firmy/sklad" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Sklad
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Dokončit výrobu / Přijmout výrobky</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Zapíše novou šarži hotového výrobku jako append-only skladový pohyb (production_in).
        </p>
      </div>

      {hotovoParam && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-sm text-green-800">
          Šarže „{hotovoParam}“ byla zapsána.
        </div>
      )}

      <div className="max-w-md">
        <VyrobaForm stockItems={finishedGoods} stockLocations={stockLocations} responsiblePeople={responsiblePeople} />
      </div>
    </div>
  );
}
