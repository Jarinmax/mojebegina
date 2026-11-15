// Jardova karta — podmínky odměn PODLE SMLOUVY s Jaroslavem Blahoutem.
//
// DOKUD NENÍ SMLOUVA ZAPRACOVANÁ, JE JARDA_REWARD_TERMS = null a karta
// odměnu nepočítá (zobrazí „doplní se podle smlouvy“). Sazby, bonusy ani
// podmínky se NEodhadují (pokyn vedení 15. 11. 2026). Vedení zatím ústně
// uvedlo 3 % a 5 % u kontaktu, který Jarda sám získal — přesné znění,
// základ a podmínky budou převzaty ze smlouvy.
import type { RewardCustomer } from "./jardaRewardsValidation";

export type JardaRewardTerms = {
  /** Odkud podmínky pocházejí (smlouva, článek), pro zobrazení na kartě. */
  source: string;
};

export const JARDA_REWARD_TERMS: JardaRewardTerms | null = null;

export type JardaRewardLine = { leadId: string; label: string; amountKc: number };

export type JardaRewards = {
  /** false = podmínky ze smlouvy ještě nejsou zapracované. */
  termsAvailable: boolean;
  termsSource: string | null;
  lines: JardaRewardLine[];
  totalKc: number | null;
};

export function computeJardaRewards(_customers: readonly RewardCustomer[], terms: JardaRewardTerms | null): JardaRewards {
  if (terms === null) {
    return { termsAvailable: false, termsSource: null, lines: [], totalKc: null };
  }
  // Výpočet doplní zapracování smlouvy (sazby, základ, bonus, období).
  return { termsAvailable: false, termsSource: terms.source, lines: [], totalKc: null };
}
