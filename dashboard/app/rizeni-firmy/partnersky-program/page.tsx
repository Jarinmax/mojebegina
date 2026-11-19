import Link from "next/link";
import { db } from "@/lib/db/client";
import { addMonths, buildPartnerEmail, monthKey, monthName, parseMonthKey } from "@/lib/eshop/partnerMonthly";
import { loadPartnerMonthOverview, pragueYearMonth } from "@/lib/eshop/partnerMonthlyServer";
import ApprovalForm, { type ApprovalRow } from "./ApprovalForm";
import { suggestSalutation } from "@/lib/eshop/salutation";

// Partnerský program — měsíční vyhodnocení a schválení (15. 11. 2026).
// Autorizaci (ADMIN/EXECUTIVE) řeší app/rizeni-firmy/layout.tsx, akce si ji
// ověřují znovu. Počítá se jen z uhrazených objednávek e-shopu.
export const dynamic = "force-dynamic";

export default async function PartnerProgramPage(props: PageProps<"/rizeni-firmy/partnersky-program">) {
  const searchParams = await props.searchParams;
  const today = pragueYearMonth(new Date());
  // Do 10. dne se řeší ještě minulý měsíc (pozdní schválení), potom aktuální.
  const fallback = today.day <= 10 ? addMonths(today, -1) : { year: today.year, month: today.month };
  const requested = typeof searchParams.mesic === "string" ? parseMonthKey(searchParams.mesic) : null;
  const evaluatedMonth = requested ?? fallback;
  const overview = await loadPartnerMonthOverview(db, evaluatedMonth);
  const { validMonth, state } = overview;
  const optOuts = new Set(overview.optOuts);
  const sent = new Set(state.sent);

  const rows: ApprovalRow[] = overview.clients.map((client) => ({
    key: client.key,
    name: client.name,
    emails: client.emails,
    orders: client.orders,
    totalKc: client.totalKc,
    goodsKc: client.goodsKc,
    tierLabel: client.tierLabel,
    percent: client.percent,
    individual: state.individual[client.key] ?? null,
    // 19. 11. 2026 (Lucie): neschválený měsíc → návrh oslovení ze jména (s titulem, když ho zákazník uvedl).
    // Neschválený měsíc: dřív schválené oslovení klienta, jinak návrh ze jména.
    salutation: state.salutations[client.key] ?? (state.approvedAt ? "" : overview.rememberedSalutations[client.key] ?? suggestSalutation(client.personName)),
    optedOut: client.emails.length > 0 && client.emails.every((email) => optOuts.has(email)),
    sent: client.emails.some((email) => sent.has(email)),
  }));
  const sample = overview.clients.find((client) => client.percent !== null && client.percent > 0);
  const preview = sample ? buildPartnerEmail({ salutation: state.salutations[sample.key], evaluatedMonth, goodsKc: sample.goodsKc, percent: sample.percent ?? 0 }) : null;
  const previous = monthKey(addMonths(evaluatedMonth, -1));
  const next = monthKey(addMonths(evaluatedMonth, 1));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6 text-neutral-900">
      <div>
        <h1 className="text-2xl font-semibold">
          Partnerský program — {monthName(evaluatedMonth)} {evaluatedMonth.year}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Uhrazené objednávky z e-shopu zaplacené v tomto měsíci (zboží po slevě, bez dopravy). Sleva platí v měsíci {monthName(validMonth)} {validMonth.year}.
        </p>
        <p className="mt-2 text-sm flex flex-wrap gap-x-4 gap-y-1">
          <Link className="underline" href={`/rizeni-firmy/partnersky-program?mesic=${previous}`}>
            ← předchozí měsíc
          </Link>
          <Link className="underline" href={`/rizeni-firmy/partnersky-program?mesic=${next}`}>
            další měsíc →
          </Link>
        </p>
      </div>

      <p className="text-sm rounded-lg bg-neutral-100 px-3 py-2">
        {state.approvedAt
          ? `Schváleno ${new Date(state.approvedAt).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })} (${state.approvedBy ?? "?"}).`
          : "Zatím neschváleno — klientům nic neodejde."}{" "}
        {state.finalizedAt ? `Slevy zapnuty a e-maily rozeslány ${new Date(state.finalizedAt).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}.` : "Slevy se zapnou a e-maily odejdou po půlnoci prvního dne měsíce. Klient v pokladně zadá e-mail a klikne na „Uplatnit“, žádný kód nepíše."}
      </p>

      {rows.length === 0 ? (
        <p>V tomto měsíci zatím není žádná uhrazená objednávka z e-shopu.</p>
      ) : (
        <ApprovalForm month={monthKey(evaluatedMonth)} rows={rows} />
      )}

      {preview && (
        <div className="border-t border-neutral-200 pt-4">
          <h2 className="font-medium mb-2">Náhled e-mailu klientovi ({sample?.name})</h2>
          <p className="text-sm font-medium">{preview.subject}</p>
          <pre className="mt-2 whitespace-pre-wrap text-sm bg-neutral-50 rounded-lg p-3 font-sans">{preview.text}</pre>
        </div>
      )}
    </div>
  );
}
