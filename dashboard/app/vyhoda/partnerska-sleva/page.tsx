import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import DecorativeMark from "@/components/DecorativeMark";
import BottomNav from "@/components/BottomNav";
import { bottomNavItems } from "@/mock/customer";
import { formatKc } from "@/lib/format";
import { getPartnerTierStatus } from "@/lib/partnerTier";
import { partnerTiers, mockMonthlyPurchase } from "@/mock/partnerProgram";

// Stejná funkce a stejná mock data jako PartnerProgramSummary a
// /partnersky-program — čísla na téhle obrazovce z definice nemohou
// odporovat zbytku aplikace.
const { currentTier, nextTier, remaining, progressPercent } =
  getPartnerTierStatus(mockMonthlyPurchase, partnerTiers);

const currentDiscountText = currentTier.discountPercent
  ? `Sleva ${currentTier.discountPercent} %`
  : currentTier.discountLabel;

export default function Page() {
  return (
    <div className="min-h-screen bg-neutral-50 relative overflow-hidden">
      <DecorativeMark />
      <div className="max-w-[380px] mx-auto px-3 pt-1 pb-24 relative z-10">
        <PageHeader title="Vaše partnerská výhoda" />

        <div className="rounded-2xl p-4 mb-4 bg-begina-primary-800 text-begina-primary-50">
          <p className="text-xs mb-1 opacity-80">Vaše partnerská výhoda</p>
          <p className="text-2xl font-medium mb-3">{currentDiscountText}</p>
          <p className="text-sm opacity-90 mb-4">
            Tuto partnerskou úroveň jste získali díky svým nákupům v
            programu Begina.
          </p>

          <div className="flex flex-col gap-1.5 text-sm mb-3">
            <div className="flex justify-between">
              <span className="opacity-70">Tento měsíc</span>
              <span className="font-medium">{formatKc(mockMonthlyPurchase)}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">Aktuální úroveň</span>
              <span className="font-medium">{currentDiscountText}</span>
            </div>
            {nextTier && (
              <>
                <div className="flex justify-between">
                  <span className="opacity-70">Další úroveň</span>
                  <span className="font-medium">
                    {nextTier.discountPercent
                      ? `Sleva ${nextTier.discountPercent} %`
                      : nextTier.discountLabel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-70">Do další úrovně vám chybí</span>
                  <span className="font-medium">{formatKc(remaining)}</span>
                </div>
              </>
            )}
          </div>

          {nextTier ? (
            <p className="text-sm font-medium mb-2">
              Ještě {formatKc(remaining)} a získáte{" "}
              {nextTier.discountPercent
                ? `slevu ${nextTier.discountPercent} %`
                : nextTier.discountLabel}
            </p>
          ) : (
            <p className="text-sm font-medium mb-2">
              Máte nejvyšší standardní úroveň
            </p>
          )}

          <div className="relative h-4">
            <span
              className="absolute -translate-x-1/2 text-[11px] font-semibold text-begina-accent-100 whitespace-nowrap"
              style={{ left: `${Math.min(94, Math.max(6, progressPercent))}%` }}
            >
              {formatKc(mockMonthlyPurchase)}
            </span>
          </div>

          <div className="h-1.5 rounded-full bg-white/15 mb-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-begina-accent-100"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] opacity-70">
            <span>{formatKc(currentTier.minAmount)}</span>
            <span>{nextTier ? formatKc(nextTier.minAmount) : "—"}</span>
          </div>
        </div>

        <p className="text-sm text-neutral-600 leading-relaxed mb-4">
          Partnerská úroveň se vyhodnocuje podle součtu vašich uhrazených
          objednávek za kalendářní měsíc. Započítává se hodnota zboží bez
          dopravy a dalších poplatků. Získaná sleva platí pro všechny
          objednávky v následujícím měsíci.
        </p>

        <Link
          href="/partnersky-program"
          className="text-sm font-medium text-begina-primary-900 inline-flex items-center gap-1"
        >
          Zobrazit celý partnerský program
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <BottomNav items={bottomNavItems} activeHref="/vyhoda/partnerska-sleva" />
    </div>
  );
}
