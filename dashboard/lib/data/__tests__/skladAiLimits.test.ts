// Blokující bod 8: vytěžení (dvě AI volání) se musí vejít do maxDuration
// stránky a route, ze kterých se spouští — jinak by funkce skončila dřív,
// než stihne neúspěšný pokus označit, a příjemka by zůstala „probíhá“.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AI_CALL_MAX_RETRIES, AI_CALL_TIMEOUT_MS } from "../aiCallDiagnostics";

vi.mock("server-only", () => ({}));

const APP = path.join(__dirname, "../../../app");
const ENTRY_POINTS = ["api/sklad/prijemky/[receiptId]/vytezit/route.ts", "rizeni-firmy/sklad/prijemky/[id]/page.tsx"];

function maxDurationOf(file: string): number | null {
  const match = readFileSync(path.join(APP, file), "utf8").match(/export const maxDuration = (\d+);/);
  return match ? Number(match[1]) : null;
}

describe("limity AI vytěžení", () => {
  it.each(ENTRY_POINTS)("%s má maxDuration s rezervou nad dvěma voláními modelu", (file) => {
    const seconds = maxDurationOf(file);
    expect(seconds).not.toBeNull();
    expect(seconds! * 1000).toBeGreaterThanOrEqual(2 * AI_CALL_TIMEOUT_MS + 60_000);
  });

  it("žádné automatické opakování placeného volání", () => {
    expect(AI_CALL_MAX_RETRIES).toBe(0);
  });
});
