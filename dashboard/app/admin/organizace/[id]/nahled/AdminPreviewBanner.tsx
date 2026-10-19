// Trvale viditelný pruh administrátorského náhledu. Jediné aktivní prvky
// náhledu jsou tady: přepínání pohledů náhledu a návrat do administrace.
import Link from "next/link";

export type PreviewView = "prehled" | "objednavky" | "profil";

const VIEWS: Array<{ id: PreviewView; label: string }> = [
  { id: "prehled", label: "Přehled" },
  { id: "objednavky", label: "Historie objednávek" },
  { id: "profil", label: "Profil" },
];

export default function AdminPreviewBanner({
  organizationId,
  organizationName,
  view,
  contact,
}: {
  organizationId: string;
  organizationName: string;
  view: PreviewView;
  contact: { name: string | null; email: string } | null;
}) {
  return (
    <div role="region" aria-label="Administrátorský náhled" className="sticky top-0 z-50 -mx-4 -mt-6 mb-4 border-b-2 border-amber-400 bg-amber-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-amber-950">
          Administrátorský náhled – vidíte kartu jako zákazník {organizationName}
        </p>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-950">Pouze pro čtení</span>
        <Link
          href={`/admin/organizace/${organizationId}`}
          className="ml-auto rounded-lg bg-begina-primary-900 px-3 py-1.5 text-sm font-medium text-begina-primary-50"
        >
          Zpět do administrace
        </Link>
      </div>
      <p className="mt-1 text-xs text-amber-900">
        {contact
          ? `Karta jménem účtu ${contact.name ?? contact.email} (${contact.email}). Nic v náhledu nejde změnit ani odeslat.`
          : "Organizace zatím nemá zákaznický účet — kontaktní údaje v náhledu chybí. Nic v náhledu nejde změnit ani odeslat."}
      </p>
      <nav aria-label="Pohledy náhledu" className="mt-2 flex gap-1">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={`/admin/organizace/${organizationId}/nahled?zobrazeni=${v.id}`}
            aria-current={v.id === view ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              v.id === view ? "bg-amber-900 text-amber-50" : "bg-white text-amber-950 border border-amber-300"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
