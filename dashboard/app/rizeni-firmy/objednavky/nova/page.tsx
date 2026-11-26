import { listOrganizationsForOrderPicker } from "@/lib/data/orders";
import CreateOrderForm from "../CreateOrderForm";
import { db } from "@/lib/db/client";
import { listTrackedStock, trackedDisplayName } from "@/lib/eshop/variantStock";

// Security Phase 15 (Objednávky 1.0) — ruční zadání objednávky. Autorizace
// (ADMIN nebo EXECUTIVE) řeší app/rizeni-firmy/layout.tsx nad touto
// stránkou, listOrganizationsForOrderPicker si ji navíc ověřuje sama.
export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const organizations = await listOrganizationsForOrderPicker();
  const trackedItems = (await listTrackedStock(db).catch(() => [])).map(trackedDisplayName);

  return (
    <div>

      <h1 className="text-lg font-medium text-begina-primary-900 mt-1 mb-4">Nová objednávka</h1>

      <CreateOrderForm organizations={organizations} trackedItems={trackedItems} />
      {trackedItems.length > 0 && (
        <p className="text-xs text-neutral-500 mt-2">
          Kapsičky 650 ml vyberte z nabídky v poli Název ({trackedItems.join(", ")}) – kusy se pak samy odečtou ze skladu.
        </p>
      )}
    </div>
  );
}
