import Link from "next/link";
import { listStockLocations, listSuppliers } from "@/lib/data/sklad";
import NovaPrijemkaForm from "./NovaPrijemkaForm";

export default async function NovaPrijemkaPage() {
  const [suppliers, stockLocations] = await Promise.all([listSuppliers(), listStockLocations()]);

  return (
    <div>
      <Link href="/rizeni-firmy" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Řízení firmy
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Nová příjemka</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Založí se jako návrh — fotky stran dokladu přidáte na dalším kroku.
        </p>
      </div>

      <div className="max-w-md">
        <NovaPrijemkaForm suppliers={suppliers} stockLocations={stockLocations} />
      </div>
    </div>
  );
}
