// Mobilní tok 1.0 — AI vytěžení účtenky, FÁZE 1: čisté OCR. Přepracování
// po druhém ostrém testu (Preview `61c9755`): nano i mini nad OBRÁZKY
// nevrátily ani jeden použitelný řádek, takže appka teď vytěžení dělá ve
// dvou jasně oddělených fázích — nejdřív čisté OCR (tenhle soubor,
// obrazový vstup → prostý text), teprve POTOM strukturování textu do
// schématu (receiptExtractionModel.ts). Stejný princip izolace jako tam:
// jen tenhle export se v testech mockuje, žádné skutečné (natož placené)
// volání modelu v testech.
//
// Vercel AI Gateway přes OIDC, BEZ apiKey — stejný mechanismus jako
// receiptExtractionModel.ts (viz komentář tam, ověřeno přímo ve zdroji
// @ai-sdk/gateway).
import "server-only";
import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import type { ReceiptImageInput } from "./receiptImagePreprocessing";

// OCR model — čte se z proměnné prostředí AI_GATEWAY_OCR_MODEL (fallback
// na alibaba/qwen3-vl-instruct), stejný vzor jako EXTRACTION_MODEL_ID v
// receiptExtractionModel.ts. `alibaba/qwen3-vl-instruct` je model
// specializovaný na vision/OCR úlohy (ne obecné strukturování) — ověřeno
// jako platné ID přímo v nainstalované verzi @ai-sdk/gateway@4.0.110
// (GatewayModelId typ v node_modules), ne odhadnuté.
export const OCR_MODEL_ID = process.env.AI_GATEWAY_OCR_MODEL?.trim() || "alibaba/qwen3-vl-instruct";

// Pod touhle délkou (po ořezání bílých znaků) appka OCR výsledek považuje
// za prakticky prázdný/nečitelný — selže hned tady, BEZ dalšího (placeného)
// volání strukturovacího modelu (bod zadání: "bez dalšího placeného
// pokusu"). Nízký práh záměrně — appka nemá false-positive odmítat krátké,
// ale skutečně čitelné doklady.
export const MIN_OCR_TEXT_LENGTH = 30;

const OCR_PROMPT = `Jsi nástroj pro OCR (optické rozpoznávání textu) z fotek účtenek/faktur z českých velkoobchodů a prodejen (např. Makro, Penny). Dostaneš jeden nebo víc obrazových výřezů TÉHOŽ dokladu, V POŘADÍ SHORA DOLŮ — pokud je jich víc, navazují na sebe a sousední výřezy se mohou částečně překrývat.

Pro KAŽDÝ výřez (přesně v pořadí, v jakém jsou přiložené) přepiš VEŠKERÝ čitelný text PŘESNĚ tak, jak je vytištěný — řádek po řádku, ve stejném pořadí. Žádné shrnutí, žádná interpretace, žádné vynechávání, nic si nevymýšlej. Čísla, ceny a kódy přepisuj znak po znaku přesně.

Před text KAŽDÉHO výřezu napiš na samostatný řádek značku "=== VÝŘEZ <pořadové číslo od 1> ===". Když je výřez prázdný nebo nečitelný, napiš pod značku jen "(nečitelné)".

Nevracej nic jiného — žádný komentář, žádné shrnutí, žádné markdown formátování kromě těch značek.`;

// Vrací PROSTÝ TEXT (ne strukturovaný objekt) — záměrně žádné `output:
// Output.object(...)`, OCR fáze jen přepisuje, nerozhoduje o struktuře
// dokladu (to dělá až extractStructuredReceipt nad výsledným textem).
export async function performReceiptOcr(images: ReceiptImageInput[]): Promise<string> {
  const { text } = await generateText({
    model: gateway(OCR_MODEL_ID),
    providerOptions: {
      gateway: { has: ["vision"] },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: OCR_PROMPT },
          ...images.map((image) => ({
            type: "file" as const,
            mediaType: image.mimeType,
            data: { type: "data" as const, data: image.bytes },
          })),
        ],
      },
    ],
  });
  return text;
}
