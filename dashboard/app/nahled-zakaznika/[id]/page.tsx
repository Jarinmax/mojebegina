// Náhled zákaznické karty („očima zákazníka“), JEN PRO ČTENÍ.
//
// - Přístup jen s úzkým oprávněním customer_card_preview (udělené
//   konkrétnímu user_id, lib/data/customerCardPreviewAuth.ts) — nestačí
//   žádná role. Ostatní, i nepřihlášený nebo se znalostí adresy, dostanou
//   404. Kontrola tady i v datové vrstvě (getCustomerPortalPreview) dřív,
//   než se z organizace cokoli načte; id z URL samo nic neotevře.
// - Žádná impersonace: session zůstává, žádná cookie, token ani heslo
//   zákazníka. Data se načtou STEJNÝMI funkcemi a vykreslí STEJNÝMI
//   komponentami jako skutečná karta (components/customer-portal).
// - Celá karta je `inert`: odkazy, tlačítka ani formuláře v ní nejdou použít.
//   Odhlášení je nahrazené neaktivní kopií. Jediné aktivní prvky jsou v pruhu.
// - Každé otevření se trvale zapíše (customer_card_preview_log: kdo, kdy,
//   která organizace); bez zápisu se náhled neotevře.
// - noindex (metadata + X-Robots-Tag) a Cache-Control: no-store (next.config.ts).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { canPreviewCustomerCards } from "@/lib/data/customerCardPreviewAuth";
import { getCustomerPortalPreview } from "@/lib/data/dashboard";
import { parsePreviewOrigin } from "@/lib/customerPreviewLinks";
import CustomerPortalShell from "@/components/customer-portal/CustomerPortalShell";
import CustomerHomeView from "@/components/customer-portal/CustomerHomeView";
import CustomerOrdersView from "@/components/customer-portal/CustomerOrdersView";
import CustomerProfileView from "@/components/customer-portal/CustomerProfileView";
import PreviewBanner, { type PreviewView } from "./PreviewBanner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const ACTIVE_HREF: Record<PreviewView, string> = { prehled: "/", objednavky: "/objednavky", profil: "/profil" };

function parseView(raw: string | string[] | undefined): PreviewView {
  return raw === "objednavky" || raw === "profil" ? raw : "prehled";
}

/** Neaktivní kopie „Odhlásit se“ — v náhledu by skutečné tlačítko odhlásilo prohlížejícího. */
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

export default async function CustomerCardPreviewPage(props: PageProps<"/nahled-zakaznika/[id]">) {
  const ctx = await getAuthContext();
  if (!(await canPreviewCustomerCards(ctx))) notFound();

  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const view = parseView(searchParams?.zobrazeni);
  const origin = parsePreviewOrigin(searchParams?.zpet) ?? (ctx!.systemRole === "ADMIN" ? "admin" : "executive");
  const preview = await getCustomerPortalPreview(id);
  if (!preview) notFound();

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <PreviewBanner
        organizationId={preview.organizationId}
        organizationName={preview.account.companyName}
        view={view}
        origin={origin}
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
    </main>
  );
}
