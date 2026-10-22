import { formatCzechDate, formatKc } from "@/lib/format";
import type { CommissionAndBonus } from "@/lib/data/commission";
import { ACQUISITION_BONUS_KC, ACQUISITION_BONUS_THRESHOLD_KC } from "@/lib/data/commission";
import { BONUS_STATUS_LABELS, BONUS_STATUS_CLASSES } from "../../bonusLabels";
import MarkBonusPaidForm from "./MarkBonusPaidForm";

// Jarda – volání a provize, část 2 — provize a akviziční bonus na detailu
// zákazníka. commission.bonusStatus === "unknown" = u téhle organizace
// chybí acquiredByUserId/acquiredAt (typicky zákazník založený před
// zavedením téhle funkce) — bonus se u ní nedá spočítat, zobrazí se to
// takhle místo domýšlení náhradního data.
export default function CommissionBonusPanel({
  organizationId,
  commission,
  isAdmin,
}: {
  organizationId: string;
  commission: CommissionAndBonus;
  isAdmin: boolean;
}) {
  const progressPct = Math.min(100, Math.round((commission.bonusProgressKc / ACQUISITION_BONUS_THRESHOLD_KC) * 100));

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-xs text-neutral-500">Provize 3 % (aktuální správce)</p>
          <p className="text-lg font-medium text-begina-primary-900">{formatKc(commission.commissionKc)}</p>
          {commission.commissionSince && (
            <p className="text-xs text-neutral-400">od {formatCzechDate(commission.commissionSince)}</p>
          )}
        </div>
      </div>

      <div className="border-t border-neutral-100 pt-3">
        <div className="flex items-center justify-between gap-3 mb-1">
          <p className="text-xs text-neutral-500">Akviziční bonus {formatKc(ACQUISITION_BONUS_KC)}</p>
          <span className={`text-xs rounded-full px-2 py-0.5 ${BONUS_STATUS_CLASSES[commission.bonusStatus]}`}>
            {BONUS_STATUS_LABELS[commission.bonusStatus]}
          </span>
        </div>

        {commission.bonusStatus === "unknown" ? (
          <p className="text-xs text-neutral-400 mt-1">
            Chybí údaj o získání zákazníka (kdo a kdy) — bonus se nedá spočítat.
          </p>
        ) : commission.bonusStatus === "not_eligible" && !commission.bonusEligible ? (
          <p className="text-xs text-neutral-400 mt-1">
            Zákazník už nakupoval před přidělením — nárok na bonus nevzniká.
          </p>
        ) : (
          <>
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mt-2 mb-1.5">
              <div className="h-full bg-begina-primary-900 rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
              <span>
                {formatKc(commission.bonusProgressKc)} / {formatKc(ACQUISITION_BONUS_THRESHOLD_KC)}
                {commission.bonusRemainingKc > 0 && ` · zbývá ${formatKc(commission.bonusRemainingKc)}`}
              </span>
              {commission.bonusDaysLeft !== null && commission.bonusStatus === "running" && (
                <span>{commission.bonusDaysLeft} dní do konce lhůty</span>
              )}
            </div>
          </>
        )}

        {commission.bonusStatus === "reached" && isAdmin && (
          <div className="mt-3">
            <MarkBonusPaidForm organizationId={organizationId} />
          </div>
        )}
      </div>
    </div>
  );
}
