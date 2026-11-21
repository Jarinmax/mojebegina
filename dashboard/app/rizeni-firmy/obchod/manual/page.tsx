import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/data/authContext";
import { canReadSalesManual } from "@/lib/data/salesManualAuth";
import {
  SALES_MANUAL_SECTIONS,
  SALES_MANUAL_SUBTITLE,
  SALES_MANUAL_TITLE,
  SALES_MANUAL_UPDATED,
} from "@/lib/obchod/salesManual";

export const dynamic = "force-dynamic";

// Manuál pro obchodníky (Lucie 20. 11. 2026) — čitelný text + PDF ke stažení.
// Přístup jen Viner, Lucie a Blahout; stránka je jen ke čtení.
export default async function SalesManualPage() {
  const ctx = await getAuthContext();
  if (!canReadSalesManual(ctx)) notFound();

  return (
    <div className="max-w-2xl">
      <Link href="/rizeni-firmy/obchod" className="text-sm text-neutral-500 hover:text-begina-primary-900">
        ← Obchod / CRM
      </Link>

      <div className="mt-2 mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-medium text-begina-primary-900">Manuál pro obchodníky</h1>
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

      <div className="flex flex-col gap-3">
        {SALES_MANUAL_SECTIONS.map((section) => (
          <section
            key={section.title}
            className={`rounded-xl border p-4 ${
              section.tone === "warning" ? "border-red-200 bg-red-50" : "border-neutral-200 bg-white"
            }`}
          >
            <h2
              className={`text-sm font-semibold mb-2 ${
                section.tone === "warning" ? "text-red-800" : "text-begina-primary-900"
              }`}
            >
              {section.title}
            </h2>
            <ul className="flex flex-col gap-2">
              {section.items.map((item) => (
                <li key={item.text} className="flex gap-2 text-sm leading-relaxed text-begina-primary-900">
                  <span className="text-neutral-400">•</span>
                  <span>
                    {item.text}
                    {item.note && <span className="block mt-1 text-xs text-neutral-600">{item.note}</span>}
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
