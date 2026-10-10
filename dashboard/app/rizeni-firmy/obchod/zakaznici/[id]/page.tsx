import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerDetail } from "@/lib/data/leads";
import { listStaffOptions } from "@/lib/data/leads";
import { formatCzechDate, formatKc } from "@/lib/format";
import CustomerOwnerForm from "./CustomerOwnerForm";
import { sanitizeReturnTo } from "../../returnTo";

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
  const searchParams = await props.searchParams;
  const backHref = sanitizeReturnTo(searchParams.returnTo);

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const customer = await getCustomerDetail(id);
  if (!customer) {
    notFound();
  }
  const staff = await listStaffOptions();

  return (
    <div>
      <Link href={backHref} className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Obchod / CRM
      </Link>

      <div className="flex items-start justify-between gap-3 mt-1 mb-4">
        <div>
          <h1 className="text-lg font-medium text-begina-primary-900">{customer.name}</h1>
          <p className="text-xs text-neutral-500 mt-0.5">IČO {customer.ico}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xl font-medium text-begina-primary-900">{customer.orderCount}</p>
          <p className="text-xs text-neutral-500">objednávek</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xl font-medium text-begina-primary-900">{formatKc(customer.totalRevenueKc)}</p>
          <p className="text-xs text-neutral-500">obrat</p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-3">
          <p className="text-xl font-medium text-begina-primary-900">
            {customer.lastOrderAt ? formatCzechDate(customer.lastOrderAt) : "—"}
          </p>
          <p className="text-xs text-neutral-500">poslední objednávka</p>
        </div>
      </div>

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

      <div className="mb-4">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Poslední objednávky</h2>
        {customer.recentOrders.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 text-sm text-neutral-600">
            Zatím žádná objednávka.
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-2">
            {customer.recentOrders.map((order) => (
              <Link
                key={order.id}
                href={`/rizeni-firmy/objednavky/${order.id}`}
                className="flex items-center justify-between text-sm hover:text-begina-primary-900"
              >
                <span className="text-neutral-600">{formatCzechDate(order.orderedAt)}</span>
                <span className="text-neutral-500">{formatKc(order.totalKc)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
