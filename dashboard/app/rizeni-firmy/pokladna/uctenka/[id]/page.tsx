import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { canUsePos, POS_DENIED } from "@/lib/pokladna/posAuth";
import { formatKc, posVariableSymbol, receiptNumber } from "@/lib/pokladna/pos";
import { getReceipt, todayPrague } from "@/lib/pokladna/posServer";
import { bankConfig, spaydString } from "@/lib/eshop/bankTransfer";
import { qrSvg } from "@/lib/eshop/qr";
import CancelForm from "./CancelForm";
import PrintButton from "./PrintButton";
import ReceiptView from "./ReceiptView";

// Účtenka bistra — zákazník ji dostane jen na vyžádání (EET 2.0 tisk
// nevyžaduje): ukázat na displeji, vytisknout nebo vyfotit. Údaje podle
// § 16 zákona o ochraně spotřebitele: kdo prodává, kdy, co a za kolik.
export const dynamic = "force-dynamic";

export default async function ReceiptPage(props: PageProps<"/rizeni-firmy/pokladna/uctenka/[id]">) {
  const ctx = await getAuthContext();
  if (!canUsePos(ctx)) return <p className="text-sm text-red-700">{POS_DENIED}</p>;
  const { id } = await props.params;
  const search = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await getReceipt(id);
  if (!r) notFound();

  const { iban } = bankConfig();
  const showQr = r.paymentMethod === "qr" && !r.cancelledAt && iban && Number.isInteger(r.totalHal / 100) && r.totalHal > 0;
  const qr = showQr
    ? await qrSvg(spaydString({ iban: iban!, amountKc: r.totalHal / 100, variableSymbol: posVariableSymbol(r.year, r.seq), message: `Bistro Begina ${receiptNumber(r.year, r.seq)}`, paymentDate: r.createdAt }))
    : null;

  return (
    <div className="max-w-md">
      <div className="flex items-center justify-between mt-1 mb-3 print:hidden">
        <Link href="/rizeni-firmy/pokladna" className="rounded-full bg-begina-primary-900 text-white px-5 py-2 text-sm font-medium">
          {search?.nova ? "Další zákazník →" : "← Pokladna"}
        </Link>
        <PrintButton />
      </div>

      {qr && (
        <div className="bg-white border-2 border-begina-primary-900 rounded-xl p-4 mb-3 text-center print:hidden">
          <p className="text-sm font-medium text-begina-primary-900">Zaplaťte QR kódem v bankovní aplikaci</p>
          <div className="mx-auto w-64" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="text-2xl font-semibold text-begina-primary-900">{formatKc(r.totalHal)}</p>
          <p className="text-xs text-neutral-500">VS {posVariableSymbol(r.year, r.seq)}</p>
        </div>
      )}
      {r.paymentMethod === "qr" && !iban && <p className="text-sm text-amber-700 mb-3 print:hidden">QR kód nejde ukázat — ve Vercelu chybí IBAN účtu (ESHOP_BANK_IBAN).</p>}

      <ReceiptView receipt={r} />

      {!r.cancelledAt && r.businessDate === todayPrague() && (
        <div className="mt-4 print:hidden">
          <CancelForm id={r.id} />
        </div>
      )}
    </div>
  );
}
