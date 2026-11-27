import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { db } from "@/lib/db/client";
import { ownInvoiceDocuments } from "@/lib/db/schema";
import { ownInvoicePdfPath } from "@/lib/eshop/invoicing/ownB2b";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import ItemQuantityEdit from "../ItemQuantityEdit";
import { formatPragueDate } from "@/lib/eshop/bankTransfer";
import { notFound } from "next/navigation";
import { getInvoiceIssueAccess, getOrderDetail, listInternalStaff, listReplacementOptions } from "@/lib/data/orders";
import { parseCheckoutAddress } from "@/lib/eshop/invoicing/draft";
import { formatCzechDate, formatKc } from "@/lib/format";
import { formatOrderNumber } from "@/lib/data/orderBuyer";
import { FulfillmentBadge, PaymentBadge } from "../OrderStatusBadges";
import FulfillmentStatusForm from "../FulfillmentStatusForm";
import PaymentStatusForm from "../PaymentStatusForm";
import OrderPayments from "../OrderPayments";
import OrderInvoiceDraft from "../OrderInvoiceDraft";
import ResponsibleForm from "../ResponsibleForm";
import NoteForm from "../NoteForm";
import OrderActivityTimeline from "../OrderActivityTimeline";
import CancelledMoneyPanel from "../CancelledMoneyPanel";
import CancelledMoneyBadge from "../CancelledMoneyBadge";
import HandoverPanel from "../../vyroba/HandoverPanel";
import { shortPragueDate } from "../dispatchText";
import { DispatchBadges } from "../OrderStatusBadges";
import { orderBatchCodes } from "@/lib/vyroba/batchAllocation";
import { hasBillingDetails, orderPartyBlocks, shippingMethodText } from "@/lib/eshop/orderParties";

// Security Phase 15 (Objednávky 1.0) — detail objednávky. Autorizace (ADMIN
// nebo EXECUTIVE) řeší app/rizeni-firmy/layout.tsx nad touto stránkou,
// getOrderDetail/listInternalStaff si ji navíc ověřují samy, stejný princip
// jako getNodeDetail.
export const dynamic = "force-dynamic";
// Serverové akce stránky volají iDoklad (kontrola / vystavení faktury):
// až ~20 čtení po 20 s — výchozí limit funkce by je mohl utnout uprostřed.
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OrderDetailPage(
  props: PageProps<"/rizeni-firmy/objednavky/[id]">
) {
  const { id } = await props.params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const detail = await getOrderDetail(id);
  if (!detail) {
    notFound();
  }
  const { order, items, activity, payments, invoice } = detail;
  // Jarin 27. 11. 2026: počet kusů jde měnit u ruční objednávky, dokud neodjela
  const itemsEditable =
    order.channel === "manual" && !order.shippedAt && !["cancelled", "handed_to_carrier", "out_for_delivery", "delivered"].includes(order.fulfillmentStatus);
  const staff = await listInternalStaff();
  const batchCodes = await orderBatchCodes(id).catch(() => new Map<string, string[]>());
  const invoiceAccess = order.invoiceable ? await getInvoiceIssueAccess() : null;
  const cancelled = order.fulfillmentStatus === "cancelled";
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" }).format(new Date());
  // náhradní objednávka: jen stornovaná s drženými penězi (před rozhodnutím o vrácení)
  const replacementOptions = order.moneyAlert?.stage === "contact" ? await listReplacementOptions() : null;
  const address = parseCheckoutAddress(order.recipientAddress);
  // Lucie 27. 11. 2026: faktura MojeBegina (řada 2026xxxx) přímo u objednávky — jen pro vystavovatele faktur
  const ctx = await getAuthContext();
  const ownInvoices =
    ctx && isInvoiceIssuer(ctx)
      ? await db
          .select({ number: ownInvoiceDocuments.number, state: ownInvoiceDocuments.state, issueDate: ownInvoiceDocuments.issueDate, totalKc: ownInvoiceDocuments.totalKc, sentAt: ownInvoiceDocuments.sentAt, paidAt: ownInvoiceDocuments.paidAt })
          .from(ownInvoiceDocuments)
          .where(and(eq(ownInvoiceDocuments.orderId, id), eq(ownInvoiceDocuments.kind, "invoice")))
          .orderBy(desc(ownInvoiceDocuments.createdAt))
      : null;

  return (
    <div>

      <div className="flex items-start justify-between gap-3 mt-1 mb-1">
        <h1 className="text-lg font-medium text-begina-primary-900">
          {order.orderNumber !== null && (
            <span className="text-neutral-500 font-normal mr-2">{formatOrderNumber(order.orderNumber)}</span>
          )}
          {order.buyerOrganizationName}
        </h1>
        <p className="text-lg font-medium text-begina-primary-900 whitespace-nowrap">
          {formatKc(order.totalKc)}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <FulfillmentBadge status={order.fulfillmentStatus} />
        <PaymentBadge status={order.paymentStatus} overdue={order.paymentOverdue} />
        <CancelledMoneyBadge money={order.moneyAlert} />
        <DispatchBadges order={order} />
      </div>

      {ownInvoices && (
        <div className={`rounded-xl border p-4 mb-4 ${ownInvoices.some((f) => f.state === "issued") ? "bg-emerald-50 border-emerald-300" : "bg-white border-neutral-200"}`}>
          <p className="text-sm font-semibold text-begina-primary-900 mb-1">🧾 Faktura</p>
          {ownInvoices.length === 0 ? (
            <p className="text-sm text-neutral-600">Faktura zatím není vystavená{order.paymentStatus === "paid" ? "." : " – u e-shopu se vystaví sama po zaplacení, u ruční objednávky při odeslání."}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ownInvoices.map((f) => (
                <li key={f.number} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-neutral-900">
                    <span className="font-semibold">č. {f.number}</span> · {formatKc(f.totalKc)} · vystavena {new Date(f.issueDate).toLocaleDateString("cs-CZ")}
                    {f.state === "cancelled" ? <span className="ml-2 text-red-700">stornovaná</span> : f.sentAt ? <span className="ml-2 text-neutral-500">odeslána zákazníkovi</span> : <span className="ml-2 text-neutral-500">zákazníkovi ještě neodešla</span>}
                  </span>
                  <a href={ownInvoicePdfPath(f.number)} target="_blank" rel="noopener" className="rounded-lg bg-begina-primary-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-begina-primary-800">
                    Otevřít / vytisknout PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {order.moneyAlert && (
        <CancelledMoneyPanel
          orderId={order.id}
          money={order.moneyAlert}
          today={today}
          replacement={
            replacementOptions && order.moneyAlert
              ? {
                  token: randomUUID(),
                  heldHal: order.moneyAlert.heldHal,
                  customer: { name: order.contactName, email: order.contactEmail, phone: order.contactPhone },
                  address: { street: address?.street ?? "", city: address?.city ?? "", zip: address?.zip ?? "" },
                  ...replacementOptions,
                }
              : null
          }
        />
      )}

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-col gap-3">
        <div>
          <p className="text-xs text-neutral-500 mb-0.5">Kdo objednal</p>
          <p className="text-sm text-begina-primary-900">{order.contactName ?? "Neuvedeno"}</p>
          {(order.contactPhone || order.contactEmail) && (
            <p className="text-xs text-neutral-500">
              {[order.contactPhone, order.contactEmail].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Objednáno</p>
            <p className="text-sm text-begina-primary-900">{formatCzechDate(order.orderedAt)}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Plánované doručení</p>
            <p className="text-sm text-begina-primary-900">
              {order.plannedDeliveryAt ? formatCzechDate(order.plannedDeliveryAt) : "Neuvedeno"}
            </p>
          </div>
        </div>

        {order.enteredByName && (
          <p className="text-xs text-neutral-400">Zapsal(a) do systému: {order.enteredByName}</p>
        )}
        {order.channel === "eshop" && <p className="text-xs text-neutral-400">Objednávka z e-shopu</p>}
        {order.channel === "eshop" && hasBillingDetails(order) === false && (
          <p className="text-xs text-neutral-400">Starší objednávka — pokladna se tehdy na fakturační údaje neptala.</p>
        )}
        {order.externalWooCommerceId && (
          <p className="text-xs text-neutral-400">Objednávka z WooCommerce (begina.cz) č. {order.externalWooCommerceId}</p>
        )}
      </div>

      {order.channel === "eshop" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {orderPartyBlocks(order).map((block) => (
            <div key={block.title} className="bg-white border border-neutral-200 rounded-xl p-4">
              <p className="text-xs text-neutral-500 mb-1">{block.title}</p>
              {block.lines.map((line, i) => (
                <p key={i} className="text-sm text-begina-primary-900 break-words">{line}</p>
              ))}
              {block.note && <p className="text-xs text-neutral-500 mt-1">{block.note}</p>}
              {block.missing.length > 0 && (
                <p className="text-xs text-red-700 mt-1">
                  <span className="font-medium">Chybí:</span> {block.missing.join("; ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {(order.shippingMethodLabel || order.paymentMethodLabel || order.recipientAddress || order.customerNote) && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-col gap-3">
          {order.shippingMethodLabel && (
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Způsob dopravy</p>
              <p className="text-sm text-begina-primary-900">
                {order.channel === "eshop" ? shippingMethodText(order) : order.shippingMethodLabel}
              </p>
              {/* e-shop: adresa je v bloku Doručovací údaje výše */}
              {order.channel !== "eshop" && order.recipientAddress && (
                <p className="text-xs text-neutral-500">{order.recipientAddress}</p>
              )}
            </div>
          )}
          {order.paymentMethodLabel && (
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Platba</p>
              <p className="text-sm text-begina-primary-900">{order.paymentMethodLabel}</p>
              {order.transferDueAt && order.paymentStatus === "unpaid" && (
                <p className={`text-xs ${order.paymentOverdue ? "text-red-700 font-medium" : "text-neutral-500"}`}>
                  Splatnost {formatPragueDate(order.transferDueAt)}
                  {order.paymentVs !== null && <> · VS {order.paymentVs}</>}
                  {order.paymentOverdue && " — po splatnosti"}
                </p>
              )}
            </div>
          )}
          {order.customerNote && (
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Poznámka zákazníka</p>
              <p className="text-sm text-begina-primary-900 whitespace-pre-wrap">{order.customerNote}</p>
            </div>
          )}
          {order.ageConfirmedAt && (
            <p className="text-xs text-neutral-400">
              Zákazník potvrdil věk 18+ ({formatCzechDate(order.ageConfirmedAt)}) — ověřit při předání.
            </p>
          )}
        </div>
      )}

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <p className="text-sm font-medium text-begina-primary-900 mb-2">Položky</p>
        <div className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-neutral-700">
                {item.quantity}× {item.name}
                {itemsEditable && item.id && <ItemQuantityEdit orderId={order.id} itemId={item.id} quantity={item.quantity} name={item.name} />}
                {item.id && batchCodes.get(item.id) && (
                  <span className="block text-xs text-neutral-500">šarže {batchCodes.get(item.id)!.join(", ")}</span>
                )}
              </span>
              <span className="text-neutral-500">{formatKc(item.lineTotalKc)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-neutral-200 mt-2 pt-2 flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between text-neutral-500">
            <span>Mezisoučet</span>
            <span>{formatKc(order.subtotalKc)}</span>
          </div>
          {order.shippingKc > 0 && (
            <div className="flex items-center justify-between text-neutral-500">
              <span>Doprava</span>
              <span>{formatKc(order.shippingKc)}</span>
            </div>
          )}
          <div className="flex items-center justify-between font-medium text-begina-primary-900">
            <span>Celkem</span>
            <span>{formatKc(order.totalKc)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
        <p className="text-sm font-medium text-begina-primary-900 mb-2">Předání a platba</p>
        {/* Lucie 26. 11.: předání osobně/přepravci + platba i v detailu objednávky */}
        {(() => {
          const needsPayment = order.channel === "manual" && order.paymentStatus !== "paid";
          const shippingText = (order.shippingMethodLabel ?? "").toLocaleLowerCase("cs");
          const defaultMode = /osobní odběr|osobni odber|vyzvednut/.test(shippingText) ? "personal" : "carrier" /* Lucie 26. 11.: výchozí přepravce */;
          const shippedLine = order.shippedAt
            ? `${order.fulfillmentStatus === "handed_to_carrier" ? "Předáno přepravci" : defaultMode === "personal" ? "Předáno osobně" : "Doručeno"} ${shortPragueDate(order.shippedAt)}${order.shippedByName ? ` · ${order.shippedByName}` : ""}`
            : null;
          const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
          return order.fulfillmentStatus === "cancelled" ? null : (
            <div className="mb-3">
              <HandoverPanel
                orderId={order.id}
                needsPayment={needsPayment}
                defaultMode={defaultMode}
                shipped={Boolean(order.shippedAt)}
                shippedLine={shippedLine}
                today={today}
              />
            </div>
          );
        })()}
        {/* Lucie 26. 11.: žádné zaškrtávání faktury — odchází sama, tady jen informace */}
        {!order.shippedAt && (
          <p className="text-xs text-neutral-500">Po potvrzení předání odejde faktura zákazníkovi sama.</p>
        )}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-col gap-4">
        {/* Lucie 26. 11.: stav a platba jen jako schovaná ruční oprava, ať nemate vedle panelu Předání */}
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-neutral-500">Ruční oprava stavu (jen výjimky — běžně nepoužívej)</summary>
          <div className="flex flex-col gap-4 mt-3">
        <FulfillmentStatusForm
          orderId={order.id}
          currentStatus={order.fulfillmentStatus}
          emailsCustomer={order.channel === "eshop" && Boolean(order.contactEmail)}
        />
        {payments ? (
          // E-shop: Zaplaceno se počítá z plateb — místo přepínání „Zapsat platbu“.
          <OrderPayments
            orderId={order.id}
            summary={payments}
            paymentVs={order.paymentVs}
            token={randomUUID()}
            cancelled={cancelled}
            today={today}
          />
        ) : (
          <PaymentStatusForm orderId={order.id} currentStatus={order.paymentStatus} />
        )}
          </div>
        </details>
        <ResponsibleForm
          orderId={order.id}
          responsibleUserId={order.responsibleUserId}
          responsibleName={order.responsibleName}
          staff={staff}
        />
        <NoteForm orderId={order.id} currentNote={order.note} />
      </div>

      {order.invoiceable && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
          <OrderInvoiceDraft
            orderId={order.id}
            invoice={invoice}
            paid={order.paymentStatus === "paid"}
            live={invoiceAccess?.mode.mode === "live"}
            trigger={invoiceAccess?.mode.trigger ?? "off"}
            canIssue={!cancelled && (invoiceAccess?.canIssue ?? false)}
            cancelled={cancelled}
            issuer={invoiceAccess?.issuer ?? false}
          />
        </div>
      )}

      <div className="mb-4">
        <h2 className="text-sm font-medium text-begina-primary-900 mb-2">Aktivita</h2>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <OrderActivityTimeline activity={activity} />
        </div>
      </div>
    </div>
  );
}
