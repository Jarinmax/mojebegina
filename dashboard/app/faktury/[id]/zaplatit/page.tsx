import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleAlert, Landmark, QrCode } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import DecorativeMark from "@/components/DecorativeMark";
import PageHeader from "@/components/PageHeader";
import { getCustomerPayableInvoice } from "@/lib/data/customerInvoicePayments";
import { requireCustomerContext } from "@/lib/data/dashboard";
import { formatKc } from "@/lib/format";
import { bankConfig, formatIban, formatPragueDate, spaydString } from "@/lib/eshop/bankTransfer";
import { liveInvoicingGate } from "@/lib/eshop/invoicing/mode";
import { qrSvg } from "@/lib/eshop/qr";
import { isCardPaymentAvailable } from "@/lib/eshop/stripe/config";
import { bottomNavItems } from "@/mock/customer";
import CardPaymentButton from "./CardPaymentButton";

export const metadata: Metadata = { title: "Zaplatit fakturu", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PayInvoicePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ platba?: string | string[] }>;
}) {
  const { id } = await props.params;
  const { platba } = await props.searchParams;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) notFound();
  const { ctx, organizationId } = await requireCustomerContext();
  if (!organizationId) notFound();
  const invoice = await getCustomerPayableInvoice(ctx, organizationId, invoiceId);
  if (!invoice) notFound();

  const bank = bankConfig();
  const cardAvailable = isCardPaymentAvailable() && liveInvoicingGate().open;
  const canTransfer = !invoice.paid && invoice.amountDueKc > 0 && Boolean(bank.account || bank.iban);
  const qrText = canTransfer && bank.iban && invoice.variableSymbol && Number.isInteger(invoice.amountDueKc)
    ? spaydString({
        iban: bank.iban,
        amountKc: invoice.amountDueKc,
        variableSymbol: invoice.variableSymbol,
        message: `Begina faktura ${invoice.documentNumber}`,
        paymentDate: new Date(),
      })
    : null;
  const paymentQr = qrText ? await qrSvg(qrText).catch(() => null) : null;

  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <main className="max-w-[520px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <PageHeader title="Zaplatit fakturu" />

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-neutral-500">Faktura</p>
              <h1 className="text-xl font-semibold text-begina-primary-900">č. {invoice.documentNumber}</h1>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${invoice.paid ? "bg-begina-primary-100 text-begina-primary-800" : "bg-amber-100 text-amber-800"}`}>
              {invoice.paid ? "Uhrazeno" : invoice.paidKc > 0 ? "K doplacení" : "Neuhrazeno"}
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-neutral-500">Zbývá zaplatit</dt>
            <dd className="text-right text-lg font-semibold text-begina-primary-900">{formatKc(invoice.amountDueKc)}</dd>
            <dt className="text-neutral-500">Variabilní symbol</dt>
            <dd className="text-right font-mono">{invoice.variableSymbol ?? "—"}</dd>
            {invoice.maturityAt && <><dt className="text-neutral-500">Splatnost</dt><dd className="text-right">{formatPragueDate(invoice.maturityAt)}</dd></>}
          </dl>
        </section>

        {invoice.paid ? (
          <div className="rounded-2xl border border-begina-primary-200 bg-begina-primary-50 p-4 flex gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-begina-primary-800" />
            <p className="text-sm text-begina-primary-900">Faktura je zaplacená. Děkujeme.</p>
          </div>
        ) : (
          <>
            {platba === "ok" && (
              <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 mb-4 text-sm text-sky-900">
                Platba byla odeslána. Čekáme na potvrzení platební brány; stav se po chvíli aktualizuje.
              </div>
            )}
            {platba === "zrusena" && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4 text-sm text-amber-900">
                Platba kartou nebyla dokončena. Můžete to zkusit znovu nebo zaplatit převodem.
              </div>
            )}

            {cardAvailable && (
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 mb-4">
                <h2 className="font-semibold text-begina-primary-900 mb-1">Kartou online</h2>
                <p className="text-sm text-neutral-600 mb-4">Bezpečná platba přes Stripe. Podporuje také Apple Pay a Google Pay.</p>
                <CardPaymentButton invoiceId={invoice.id} />
              </section>
            )}

            {canTransfer && (
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 mb-4" aria-labelledby="bank-transfer-title">
                <div className="flex items-center gap-2 mb-1">
                  <Landmark className="h-5 w-5 text-begina-primary-900" />
                  <h2 id="bank-transfer-title" className="font-semibold text-begina-primary-900">Převodem</h2>
                </div>
                <p className="text-sm text-neutral-600 mb-4">Údaje zadejte do svého internetového bankovnictví.</p>
                <div className="flex flex-col sm:flex-row gap-5">
                  {paymentQr && (
                    <div className="shrink-0 self-center text-center">
                      <div className="flex items-center justify-center gap-1.5 text-sm font-medium mb-2"><QrCode className="h-4 w-4" /> QR kód</div>
                      <div className="w-44 h-44 [&>svg]:w-full [&>svg]:h-full" role="img" aria-label="QR Platba" dangerouslySetInnerHTML={{ __html: paymentQr }} />
                      <p className="text-xs text-neutral-500 mt-1">Naskenujte v aplikaci banky</p>
                    </div>
                  )}
                  <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm content-start flex-1">
                    {bank.account && <><dt className="text-neutral-500">Číslo účtu</dt><dd className="font-medium break-all">{bank.account}</dd></>}
                    {bank.iban && <><dt className="text-neutral-500">IBAN</dt><dd className="font-medium break-all">{formatIban(bank.iban)}</dd></>}
                    <dt className="text-neutral-500">Částka</dt><dd className="font-semibold">{formatKc(invoice.amountDueKc)}</dd>
                    <dt className="text-neutral-500">Variabilní symbol</dt><dd className="font-mono font-medium">{invoice.variableSymbol ?? "—"}</dd>
                  </dl>
                </div>
              </section>
            )}

            {!cardAvailable && !canTransfer && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
                <CircleAlert className="h-5 w-5 shrink-0 text-amber-800" />
                <p className="text-sm text-amber-900">Online platba teď není dostupná. Napište nám prosím na info@begina.cz.</p>
              </div>
            )}
          </>
        )}

        <Link href="/objednavky" className="inline-block mt-5 text-sm font-medium underline underline-offset-2">← Zpět na historii nákupů</Link>
      </main>
      <BottomNav items={bottomNavItems} activeHref="/objednavky" />
    </div>
  );
}
