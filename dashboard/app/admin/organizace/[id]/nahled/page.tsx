// Administrátorský náhled zákaznické karty („očima zákazníka“), JEN PRO ČTENÍ.
//
// - Přístup jen ADMIN: kontrola tady (layout /admin běží souběžně se stránkou,
//   takže se na něj samotný nespoléháme) a znovu v datové vrstvě
//   (getCustomerPortalPreviewForAdmin) dřív, než se cokoli z organizace načte.
//   Ostatní role i nepřihlášený dostanou 404 (layout /admin je navíc
//   přesměruje pryč, jako všude v administraci).
// - Žádná impersonace: session zůstává ADMIN, žádná cookie, token ani heslo
//   zákazníka. Data se načtou STEJNÝMI funkcemi a vykreslí STEJNÝMI
//   komponentami jako skutečná karta (components/customer-portal).
// - Celá karta je `inert`: odkazy, tlačítka ani formuláře v ní nejdou použít.
//   Odhlášení je nahrazené neaktivní kopií. Jediné aktivní prvky jsou v pruhu.
// - noindex (metadata + X-Robots-Tag) a Cache-Control: no-store (next.config.ts).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isAdmin } from "@/lib/data/adminAuth";
import { getCustomerPortalPreviewForAdmin } from "@/lib/data/dashboard";
import CustomerPortalShell from "@/components/customer-portal/CustomerPortalShell";
import CustomerHomeView from "@/components/customer-portal/CustomerHomeView";
import CustomerOrdersView from "@/components/customer-portal/CustomerOrdersView";
import CustomerProfileView from "@/components/customer-portal/CustomerProfileView";
import AdminPreviewBanner, { type PreviewView } from "./AdminPreviewBanner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const ACTIVE_HREF: Record<PreviewView, string> = { prehled: "/", objednavky: "/objednavky", profil: "/profil" };

function parseView(raw: string | string[] | undefined): PreviewView {
  return raw === "objednavky" || raw === "profil" ? raw : "prehled";
}

/** Neaktivní kopie „Odhlásit se“ — v náhledu by skutečné tlačítko odhlásilo administrátora. */
function SignOutPlaceholder() {
  return (
    <button
      type="button"
      disabled
      className="w-full text-sm font-medium text-begina-primary-900 border border-begina-primary-700 rounded-lg py-2.5 disabled:opacity-50"
    >
      Odhlásit se
    </button>
  );
}

export default async function AdminCustomerPreviewPage(props: PageProps<"/admin/organizace/[id]/nahled">) {
  const ctx = await getAuthContext();
  if (!ctx || ctx.roleSelectionRequired || !isAdmin(ctx)) notFound();

  const { id } = await props.params;
  const view = parseView((await props.searchParams)?.zobrazeni);
  const preview = await getCustomerPortalPreviewForAdmin(id);
  if (!preview) notFound();

  return (
    <div>
      <AdminPreviewBanner
        organizationId={preview.organizationId}
        organizationName={preview.account.companyName}
        view={view}
        contact={preview.previewContact}
      />
      {/* transform: pevně umístěná spodní navigace karty zůstane v rámečku náhledu */}
      <div inert aria-label="Zákaznická karta (náhled, jen pro čtení)" className="rounded-xl border border-neutral-200 overflow-hidden [transform:translateZ(0)]">
        <CustomerPortalShell activeHref={ACTIVE_HREF[view]}>
          {view === "prehled" ? (
            <CustomerHomeView account={preview.account} orders={preview.orders} showRoleSwitch={false} />
          ) : view === "objednavky" ? (
            <CustomerOrdersView orders={preview.orders} />
          ) : (
            <CustomerProfileView account={preview.account} accountActions={<SignOutPlaceholder />} />
          )}
        </CustomerPortalShell>
      </div>
    </div>
  );
}
