import Link from "next/link";
import { listOrganizationsForOrderPicker } from "@/lib/data/orders";
import CreateOrderForm from "../CreateOrderForm";

// Security Phase 15 (Objednávky 1.0) — ruční zadání objednávky. Autorizace
// (ADMIN nebo EXECUTIVE) řeší app/rizeni-firmy/layout.tsx nad touto
// stránkou, listOrganizationsForOrderPicker si ji navíc ověřuje sama.
export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const organizations = await listOrganizationsForOrderPicker();

  return (
    <div>
      <Link
        href="/rizeni-firmy/objednavky"
        className="text-sm text-neutral-500 hover:text-begina-primary-900"
      >
        ← Objednávky
      </Link>

      <h1 className="text-lg font-medium text-begina-primary-900 mt-1 mb-4">Nová objednávka</h1>

      <CreateOrderForm organizations={organizations} />
    </div>
  );
}
