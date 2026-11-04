// Sklad 1.0 — pravidlo uchovávání originálních fotek dokladů ve Vercel Blob
// (blokující bod 11). JEN rozhodnutí, nic nemaže: vrací, co by se smělo
// smazat a proč. Samotné mazání zatím neexistuje — postup a schválení
// popisuje docs/sklad/RETENCE_FOTEK.md, čtecí report
// docs/sklad/30_retence_fotek_report.sql.
//
// Pravidla (konzervativně, ke schválení účetní):
//   - doklad z POTVRZENÉ příjemky (i později stornované) je účetní záznam:
//     uchovává se do konce 10. roku po roce data dokladu (zákon o DPH § 35;
//     zákon o účetnictví § 31 žádá 5 let — platí delší lhůta). Bez data
//     dokladu se počítá od roku potvrzení,
//   - návrh, který nikdo nepotvrdil a 180 dní se nezměnil: kandidát ke
//     smazání (rozpracovaný a opuštěný doklad, nejde o účetní záznam),
//   - soubor v úložišti, na který neodkazuje žádná stránka příjemky
//     (nedokončený upload): kandidát po 7 dnech.
// Cokoli neznámého (jiný stav, chybějící data) se NIKDY nemaže.

export const ACCOUNTING_RETENTION_YEARS = 10;
export const ABANDONED_DRAFT_DAYS = 180;
export const ORPHAN_GRACE_DAYS = 7;

export type PhotoRetentionInput =
  | {
      kind: "page";
      receiptStatus: string;
      documentDate: string | null; // YYYY-MM-DD
      confirmedAt: Date | null;
      receiptUpdatedAt: Date;
    }
  | { kind: "orphan"; uploadedAt: Date };

export type PhotoRetentionDecision =
  | { action: "keep"; until: string | null; reason: string }
  | { action: "delete_candidate"; reason: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Poslední den lhůty: 31. 12. roku (rok dokladu + 10). */
export function accountingRetentionUntil(documentDate: string | null, confirmedAt: Date | null): string | null {
  const year = documentDate ? Number(documentDate.slice(0, 4)) : confirmedAt ? confirmedAt.getUTCFullYear() : NaN;
  if (!Number.isInteger(year) || year < 2000) return null;
  return `${year + ACCOUNTING_RETENTION_YEARS}-12-31`;
}

export function decidePhotoRetention(input: PhotoRetentionInput, now: Date): PhotoRetentionDecision {
  if (input.kind === "orphan") {
    const ageDays = (now.getTime() - input.uploadedAt.getTime()) / DAY_MS;
    return ageDays >= ORPHAN_GRACE_DAYS
      ? { action: "delete_candidate", reason: `soubor bez příjemky déle než ${ORPHAN_GRACE_DAYS} dní` }
      : { action: "keep", until: null, reason: "čerstvý soubor bez příjemky (upload může ještě doběhnout)" };
  }

  if (input.receiptStatus === "confirmed" || input.receiptStatus === "voided") {
    if (!input.confirmedAt) {
      return { action: "keep", until: null, reason: "chybí datum potvrzení — nemazat" };
    }
    const until = accountingRetentionUntil(input.documentDate, input.confirmedAt);
    if (!until) {
      return { action: "keep", until: null, reason: "nelze určit lhůtu — nemazat" };
    }
    const today = now.toISOString().slice(0, 10);
    return today > until
      ? { action: "delete_candidate", reason: `účetní lhůta uplynula ${until}` }
      : { action: "keep", until, reason: "účetní doklad potvrzené příjemky" };
  }

  if (input.receiptStatus === "draft") {
    const idleDays = (now.getTime() - input.receiptUpdatedAt.getTime()) / DAY_MS;
    return idleDays >= ABANDONED_DRAFT_DAYS
      ? { action: "delete_candidate", reason: `nepotvrzený návrh bez změny ${ABANDONED_DRAFT_DAYS}+ dní` }
      : { action: "keep", until: null, reason: "rozpracovaný návrh" };
  }

  return { action: "keep", until: null, reason: `neznámý stav „${input.receiptStatus}“ — nemazat` };
}
