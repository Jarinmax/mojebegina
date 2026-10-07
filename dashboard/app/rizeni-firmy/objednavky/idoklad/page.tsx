import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { eshopIdokladCredentials, invoicingMode, invoicingSwitch } from "@/lib/eshop/invoicing/mode";
import IdokladPreflightPanel from "./IdokladPreflightPanel";

// ESHOP 1.0 — „Kontrola připojení iDokladu“ (preflight). Jen Jaroslav
// Viner (invoiceAuth.ts). Stejné Client Credentials, jaké použije ostré
// vystavení, ale jen čtení — nic se nezapisuje do iDokladu ani do DB.
// Jde spustit i s vypnutou fakturací (před zapnutím na Production).
export const dynamic = "force-dynamic";

export default async function IdokladPreflightPage() {
  const ctx = await getAuthContext();
  if (!isInvoiceIssuer(ctx)) notFound();

  const mode = invoicingMode();
  const sw = invoicingSwitch();
  const hasCredentials = eshopIdokladCredentials() !== null;
  const environment = process.env.VERCEL_ENV === "production" ? "Production" : "Preview / vývoj";

  return (
    <div className="max-w-3xl">
      <Link href="/rizeni-firmy/objednavky" className="text-sm text-neutral-500 hover:underline">
        ← Objednávky
      </Link>
      <h1 className="mt-2 text-lg font-medium text-begina-primary-900">iDoklad — kontrola připojení e-shopu</h1>
      <p className="mt-0.5 text-sm text-neutral-500">
        Ověří přihlášení a nastavení iDokladu, které použije vystavení e-shopových faktur. Jen čtení.
      </p>

      <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-neutral-500">Prostředí</dt>
          <dd>{environment}</dd>
          <dt className="text-neutral-500">Přepínač fakturace</dt>
          <dd className="font-mono">
            {sw.invalid !== null ? `„${sw.invalid}“ (neplatné = off)` : sw.value}
          </dd>
          <dt className="text-neutral-500">Režim</dt>
          <dd>{mode.reason}</dd>
          <dt className="text-neutral-500">Přístupové údaje</dt>
          <dd>{hasCredentials ? "nastavené (IDOKLAD_ESHOP_CLIENT_ID / SECRET)" : "chybí"}</dd>
        </dl>
        <p className="mt-3 text-xs text-neutral-500">
          Kontrola: přihlášení (Client Credentials), agenda Begina (IČO 74337297), neplátce DPH, CZK, Česká republika (CZ),
          převod / karta / hotově (bez dobírky), řada 7277293 „E-shop Begina“ (vydané faktury, není výchozí), další číslo
          v řadě (jen náhled) a typ ceny. Do iDokladu se nic nezapíše; stejná kontrola proběhne automaticky před každým
          vystavením faktury a cokoli neprojde = faktura se nevystaví.
        </p>
      </div>

      <div className="mt-4">
        <IdokladPreflightPanel />
      </div>
    </div>
  );
}
