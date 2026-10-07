import { formatKc } from "@/lib/format";
import { formatIban, formatPragueDate, type TransferInfo } from "@/lib/eshop/bankTransfer";

// ESHOP 1.0 — platební údaje k převodu + QR Platba na stránce objednávky.
// SVG kreslí lib/eshop/qr.ts na serveru z našeho vlastního textu (SPAYD),
// proto je bezpečné ho vložit přímo.
export default function TransferPayment({
  transfer,
  qrSvg,
  overdue,
}: {
  transfer: TransferInfo;
  qrSvg: string | null;
  overdue: boolean;
}) {
  const rows: [string, string][] = [];
  if (transfer.account) rows.push(["Číslo účtu", transfer.account]);
  if (transfer.iban) rows.push(["IBAN", formatIban(transfer.iban)]);
  rows.push(["Částka", formatKc(transfer.amountKc)]);
  if (transfer.variableSymbol) rows.push(["Variabilní symbol", transfer.variableSymbol]);
  else rows.push(["Zpráva pro příjemce", transfer.message]);
  rows.push(["Splatnost", formatPragueDate(transfer.dueAt)]);

  return (
    <section className="border border-neutral-200 rounded-2xl p-5 text-sm mb-6" aria-labelledby="platba-prevodem">
      <h2 id="platba-prevodem" className="font-semibold mb-3">
        Platba převodem
      </h2>
      {overdue && (
        <p className="text-begina-accent-900 bg-begina-accent-100 rounded-lg px-3 py-2 mb-3">
          Platba je po splatnosti. Pokud jste už zaplatili, nic nedělejte — jakmile platbu uvidíme, ozveme se.
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-5">
        {qrSvg && (
          <div className="shrink-0 self-center sm:self-start text-center">
            <div
              className="w-44 h-44 [&>svg]:w-full [&>svg]:h-full bg-white"
              role="img"
              aria-label="QR Platba"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="text-xs text-neutral-500 mt-1">Naskenujte v aplikaci banky</p>
          </div>
        )}
        <dl className="grid grid-cols-[8.5rem_1fr] gap-y-1.5 text-neutral-600 content-start">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd className="text-begina-primary-900 tabular-nums break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-neutral-600 mt-3">Objednávku vyřídíme po připsání platby na účet.</p>
    </section>
  );
}
