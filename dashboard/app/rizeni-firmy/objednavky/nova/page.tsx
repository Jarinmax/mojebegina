import Link from "next/link";
import { listOrganizationsForOrderPicker } from "@/lib/data/orders";
import CreateOrderForm from "../CreateOrderForm";

// Security Phase 15 (Objednávky 1.0) — ruční zadání objednávky. Autorizace
// (ADMIN nebo EXECUTIVE) řeší app/rizeni-firmy/layout.tsx nad touto
// stránkou, listOrganizationsForOrderPicker si ji navíc ověřuje sama.
export const dynamic = "force-dynamic";

export default async function NewOrderPage(props: PageProps<"/rizeni-firmy/objednavky/nova">) {
  const organizations = await listOrganizationsForOrderPicker();
  const searchParams = await props.searchParams;
  // Admin karta zákazníka → "Objednat znovu" (?org=...) — appka hodnotu
  // jen předá do <select defaultValue>; neplatné/cizí id prostě neodpovídá
  // žádné <option> a výběr zůstane prázdný (žádná validace tu není potřeba).
  const orgParam = Array.isArray(searchParams.org) ? searchParams.org[0] : searchParams.org;

  return (
    <div>
      <Link
        href="/rizeni-firmy/objednavky"
        className="text-sm text-neutral-500 hover:text-begina-primary-900"
      >
        ← Objednávky
      </Link>

      <h1 className="text-lg font-medium text-begina-primary-900 mt-1 mb-4">Nová objednávka</h1>

      <CreateOrderForm organizations={organizations} defaultOrganizationId={orgParam} />
    </div>
  );
}
