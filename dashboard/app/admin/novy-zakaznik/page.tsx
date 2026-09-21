import Link from "next/link";
import NovyZakaznikForm from "./NovyZakaznikForm";

// Security Phase 5 — samotné ADMIN oprávnění hlídá už app/admin/layout.tsx
// (redirect mimo /admin pro ne-ADMIN) a znovu lib/data/admin.ts
// (requireAdminContext uvnitř server action) — tahle stránka je jen UI.
export default function NovyZakaznikPage() {
  return (
    <div>
      <Link href="/admin" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Organizace
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-lg font-medium text-begina-primary-900">Nový zákazník</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Založí organizaci a uživatele bez odeslání e-mailu — pozvánku pošlete později, až
          budete připraveni, tlačítkem „Pozvat zákazníka“ na detailu organizace.
        </p>
      </div>

      <div className="max-w-md">
        <NovyZakaznikForm />
      </div>
    </div>
  );
}
