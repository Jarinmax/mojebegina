// Mobilní tok 1.0 — sdílená diagnostika obou AI fází vytěžení účtenky
// (OCR + strukturování). Reálný nález (MAKRO faktura, testovací příjemka
// na Preview): appka dosud `finishReason`/`usage` z žádné fáze vůbec
// nečetla, takže neuměla poznat, jestli model skončil přirozeně, nebo mu
// došel výstupní limit uprostřed dokladu. To je HYPOTÉZA pro pozorovaný
// ořez 16→8 položek — NEPOTVRZENO, appka nemá uložený syrový výstup z
// toho běhu. `finishReason === "length"` je jediný standardní způsob (AI
// SDK, @ai-sdk/provider — FinishReason = 'stop'|'length'|'content-filter'
// |'tool-calls'|'error'|'other'), jak model hlásí "výstupní limit mě
// zastavil uprostřed generování" — ověřeno přímo v typech
// node_modules/@ai-sdk/provider/dist/index.d.ts, ne odhadnuté.
//
// DŮLEŽITÉ: i `finishReason === "stop"` (přirozené dokončení) sám o sobě
// NEDOKAZUJE, že model přečetl/vrátil VŠECHNY položky dokladu — jen že ho
// nezastavil výstupní limit. Appka ani tahle diagnostika úplnost obsahu
// nekontroluje, jen vylučuje tenhle jeden konkrétní mechanismus.
//
// Loguje se VÝHRADNĚ bezpečná metadata — receiptId, fáze, modelId,
// finishReason, počty tokenů z usage — NIKDY OCR text, obrázky, celý
// response ani obsah warnings (ten může nést echo promptu/dat z dokladu).
import "server-only";
import type { FinishReason, LanguageModelUsage } from "ai";

export type AiCallPhase = "ocr" | "structuring";

export type AiCallOutcome = {
  receiptId: string;
  phase: AiCallPhase;
  modelId: string;
  finishReason: FinishReason | undefined;
  usage: LanguageModelUsage | undefined;
};

export function isTruncatedByOutputLimit(finishReason: FinishReason | undefined): boolean {
  return finishReason === "length";
}

export function logAiCallOutcome(outcome: AiCallOutcome): void {
  console.log(
    `[sklad] AI volání (receiptId=${outcome.receiptId}, fáze=${outcome.phase}, model=${outcome.modelId}): finishReason=${outcome.finishReason ?? "?"}`,
    {
      inputTokens: outcome.usage?.inputTokens,
      outputTokens: outcome.usage?.outputTokens,
      totalTokens: outcome.usage?.totalTokens,
    }
  );
}

// Appka NIKDY nepřijme částečný výsledek jako dokončené vytěžení a
// NIKDY automaticky nezkouší další (placený) pokus — jen to ohlásí jako
// jasnou technickou chybu. Volající (skladExtraction.ts) na tenhle typ
// chyby reaguje specifickou hláškou, ne obecnou "nezdařilo se".
export class ModelOutputTruncatedError extends Error {
  readonly phase: AiCallPhase;
  constructor(phase: AiCallPhase) {
    super(`AI model dosáhl limitu výstupu ve fázi "${phase}" — výsledek je jen částečný.`);
    this.name = "ModelOutputTruncatedError";
    this.phase = phase;
  }
}

// --- Limity AI volání (blokující bod 8) -----------------------------------
//
// maxRetries: 0 — SDK jinak opakuje neúspěšné volání 2× (až trojnásobná cena
// i doba); opakování je vždy vědomé nové kliknutí člověka. maxOutputTokens
// shora omezí cenu jednoho volání (strukturovací model navíc „přemýšlí“ —
// i to se počítá do výstupu). Useknutí limitem appka pozná (finishReason
// "length") a ohlásí. timeout: obě volání dohromady i s přípravou obrázků
// a zápisem se musí vejít do maxDuration = 300 s stránky a route, které
// vytěžení spouštějí — jinak by funkce skončila dřív, než stihne označit
// pokus jako neúspěšný.
export const AI_CALL_MAX_RETRIES = 0;
export const OCR_MAX_OUTPUT_TOKENS = 8_000;
export const STRUCTURING_MAX_OUTPUT_TOKENS = 16_000;
export const AI_CALL_TIMEOUT_MS = 110_000;
