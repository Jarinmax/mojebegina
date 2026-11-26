import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { canReadSalesManual } from "@/lib/data/salesManualAuth";
import { applyFuelSurchargeFromDb } from "@/lib/eshop/fuelSurchargeServer";
import {
  SALES_MANUAL_SECTIONS,
  SALES_MANUAL_SUBTITLE,
  SALES_MANUAL_TITLE,
  SALES_MANUAL_UPDATED,
} from "@/lib/obchod/salesManual";
import { CALL_CHEATSHEET_TITLE, callCheatsheetSections } from "@/lib/obchod/callCheatsheet";

export const dynamic = "force-dynamic";

// Manuál pro obchodníky (Lucie 20. 11. 2026) — čitelný text + PDF ke stažení.
// Přístup jen Viner, Lucie a Blahout; stránka je jen ke čtení.
export default async function SalesManualPage() {
  const ctx = await getAuthContext();
  if (!canReadSalesManual(ctx)) notFound();
  await applyFuelSurchargeFromDb();
  const cheatsheet = callCheatsheetSections();

  return (
    <div className="max-w-2xl">
      <Link href="/rizeni-firmy/obchod" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Obchod / CRM
      </Link>

      <div className="mt-2 mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-medium text-begina-primary-900">Manuál pro obchodníky</h1>
        </div>
      </div>

      {/* Taháček k hovoru (Lucie 27. 11. 2026) — nahoře, karta leadu odkazuje sem. */}
      <section id="tahacek" className="mb-6 scroll-mt-4 rounded-xl border-2 border-begina-primary-200 bg-white p-4 sm:p-6">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h2 className="text-lg font-bold text-begina-primary-900">{CALL_CHEATSHEET_TITLE}</h2>
          <a
            href="/rizeni-firmy/obchod/manual/tahacek-pdf"
            className="inline-flex items-center justify-center gap-2 self-start whitespace-nowrap rounded-lg bg-begina-primary-900 px-4 py-2 text-sm font-medium text-white hover:bg-begina-primary-800"
          >
            ⬇ Stáhnout taháček (PDF)
          </a>
        </div>
        <div className="flex flex-col gap-4">
          {cheatsheet.map((section) => (
            <div key={section.title} className={section.tone === "warning" ? "rounded-lg bg-red-50 p-3" : undefined}>
              <h3 className="text-base font-bold mb-1 text-[#C8102E]">{section.title}</h3>
              {section.paragraphs?.map((text) => (
                <p key={text} className="text-sm leading-relaxed text-neutral-900">
                  {text}
                </p>
              ))}
              {section.items && (
                <ul className="flex flex-col gap-1">
                  {section.items.map((text) => (
                    <li key={text} className="flex gap-2 text-sm leading-relaxed text-neutral-900">
                      <span>•</span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-2 mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="podrobny-manual" className="text-lg font-medium text-begina-primary-900">Podrobný manuál</h2>
          <p className="text-sm text-neutral-600 mt-0.5">{SALES_MANUAL_SUBTITLE}</p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {SALES_MANUAL_TITLE} · stav {SALES_MANUAL_UPDATED} · ceny vždy podle begina.cz
          </p>
        </div>
        <a
          href="/rizeni-firmy/obchod/manual/pdf"
          className="inline-flex items-center justify-center gap-2 self-start whitespace-nowrap rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-begina-primary-900 hover:border-begina-primary-300"
        >
          ⬇ Stáhnout PDF
        </a>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-6 flex flex-col gap-4">
        {SALES_MANUAL_SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-base font-bold mb-1.5 text-[#C8102E]">{section.title}</h2>
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => (
                <li key={item.text} className="flex gap-2 text-sm leading-relaxed text-neutral-900">
                  <span>•</span>
                  <span>
                    {item.text}
                    {item.note && <span className="block">{item.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
