import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerDetail } from "@/lib/data/leads";
import { listStaffOptions } from "@/lib/data/leads";
import { formatCzechDate, formatKc } from "@/lib/format";
import CustomerOwnerForm from "./CustomerOwnerForm";
import CustomerNoteForm from "./CustomerNoteForm";
import { getAuthContext } from "@/lib/data/authContext";
import { crmSeesAll } from "@/lib/data/crmAuth";
import type { CustomerDetail } from "@/lib/data/leads";

const SOURCE_LABEL = { eshop: "e-shop", manual: "objednávka", invoice: "faktura" } as const;

function PartnerPanel({ partner }: { partner: CustomerDetail["partner"] }) {
  if (!partner.eligible) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-1">Partnerský program</h2>
        <p className="text-sm text-neutral-600">
          Nemá nárok na partnerskou slevu — neobjednává přes e-shop (počítají se jen uhrazené objednávky z e-shopu,
          zboží bez dopravy).
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
      <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Partnerský program</h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-neutral-500">Tento měsíc přes e-shop (zboží)</p>
          <p className="text-begina-primary-900 font-medium">{formatKc(partner.thisMonthGoodsKc)}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Příští měsíc zatím</p>
          <p className="text-begina-primary-900 font-medium">{partner.nextMonthTierLabel}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Do další úrovně chybí</p>
          <p className="text-begina-primary-900 font-medium">
            {partner.nextTierLabel ? `${formatKc(partner.remainingKc)} (${partner.nextTierLabel})` : "nejvyšší úroveň"}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Sleva tento měsíc</p>
          <p className="text-begina-primary-900 font-medium">{partner.currentTierLabel}</p>
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Security Phase 16 (Obchod/CRM 1.0) — CRM pohled na zákazníka. NENÍ to
// náhrada za /admin/organizace/[id] (fakturační údaje, členové, pozvání) —
// je to obchodní pohled: kdo ho spravuje/získal a jak si vede v obratu.
// Data (počet objednávek, obrat, poslední objednávka) čte přímo z orders,
// nic se neduplikuje.
export default async function CustomerDetailPage(
  props: PageProps<"/rizeni-firmy/obchod/zakaznici/[id]">
) {
  const { id } = await props.params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const customer = await getCustomerDetail(id);
  if (!customer) {
    notFound();
  }
  const [staff, ctx] = await Promise.all([listStaffOptions(), getAuthContext()]);
  // Přiřazení obchodníka a odkazy na detail objednávky jsou pro vedení.
  const canManage = crmSeesAll(ctx);

  return (
    <div>

      <div className="flex items-start justify-between gap-3 mt-1 mb-4">
        <div>
          <h1 className="text-lg font-medium text-begina-primary-900">{customer.name}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">IČO {customer.ico}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xl font-medium text-begina-primary-900">{customer.orderCount}</p>
          <p className="text-xs text-neutral-500">nákupů</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xl font-medium text-begina-primary-900">{formatKc(customer.totalRevenueKc)}</p>
          <p className="text-xs text-neutral-500">obrat</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xl font-medium text-begina-primary-900">
            {customer.lastOrderAt ? formatCzechDate(customer.lastOrderAt) : "—"}
          </p>
          <p className="text-xs text-neutral-500">poslední nákup</p>
        </div>
      </div>

      {!customer.invoicesLoaded && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800">
          Faktury z iDokladu se teď nepodařilo načíst — čísla jsou jen z objednávek v MojeBegina. Zkuste stránku obnovit za chvíli.
        </div>
      )}

      <PartnerPanel partner={customer.partner} />

      {canManage ? (
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
          <CustomerOwnerForm
            organizationId={customer.id}
            ownerUserId={customer.ownerUserId}
            ownerName={customer.ownerName}
            acquiredByUserId={customer.acquiredByUserId}
            acquiredByName={customer.acquiredByName}
            staff={staff}
          />
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Obchodník</p>
            <p className="text-begina-primary-900">{customer.ownerName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Získal</p>
            <p className="text-begina-primary-900">{customer.acquiredByName ?? "—"}</p>
          </div>
        </div>
      )}

      <div className="mb-4">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Poznámky</h2>
        <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
          {customer.activity.length === 0 ? (
            <p className="text-sm text-neutral-500">Zatím žádná poznámka.</p>
          ) : (
            customer.activity.map((entry) => (
              <div key={entry.id} className="border-l-2 border-neutral-200 pl-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-begina-primary-900">
                    {entry.authorName ?? "Neznámý uživatel"}
                  </p>
                  <p className="text-xs text-neutral-400 whitespace-nowrap">{formatCzechDate(entry.createdAt)}</p>
                </div>
                {entry.body && <p className="text-sm text-neutral-600 whitespace-pre-wrap mt-0.5">{entry.body}</p>}
              </div>
            ))
          )}
          <CustomerNoteForm organizationId={customer.id} />
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Nákupy ({customer.purchases.length})</h2>
        {customer.purchases.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">Zatím žádný nákup.</div>
        ) : (
          <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
            {customer.purchases.map((p) => {
              const label = [
                p.orderNumber ? `obj. ${p.orderNumber}` : null,
                p.invoiceNumber ? `faktura ${p.invoiceNumber}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              const row = (
                <>
                  <span className="min-w-0">
                    <span className="text-neutral-700">{formatCzechDate(p.date)}</span>
                    <span className="block text-xs text-neutral-500">
                      {SOURCE_LABEL[p.source]}
                      {label ? ` · ${label}` : ""}
                      {!p.paid ? " · neuhrazeno" : ""}
                    </span>
                  </span>
                  <span className="text-neutral-700 tabular-nums whitespace-nowrap">{formatKc(p.totalKc)}</span>
                </>
              );
              return canManage && p.orderId ? (
                <Link
                  key={p.key}
                  href={`/rizeni-firmy/objednavky/${p.orderId}`}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm hover:bg-neutral-50"
                >
                  {row}
                </Link>
              ) : (
                <div key={p.key} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                  {row}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
