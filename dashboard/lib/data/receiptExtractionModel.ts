// Mobilní tok 1.0 — AI vytěžení účtenky, SAMOTNÉ volání modelu. Oddělené od
// skladExtraction.ts (oprávnění, DB zápis, mapování), aby šlo v testech
// zmockovat JEN tenhle jeden export a testovat orchestraci/mapování na
// reálném kódu (stejný princip jako cleanupOrphanBlob/computeActualBlobSha256
// v sklad.ts — izolovaný I/O na okraji, logika uvnitř testovatelná beze
// skutečné sítě).
//
// Vercel AI Gateway přes OIDC, BEZ apiKey — ověřeno přímo ve zdroji
// node_modules/@ai-sdk/gateway@4.0.110/dist/index.js (getGatewayAuthToken):
// když `apiKey`/`AI_GATEWAY_API_KEY` není nastavené, spadne na
// `getVercelOidcToken()` z @vercel/oidc. Stejný vzor jako Vercel Blob
// (BLOB_STORE_ID + OIDC, bez statického BLOB_READ_WRITE_TOKEN) — proto se
// tu NIKDY nesmí nastavit AI_GATEWAY_API_KEY jako proměnná prostředí.
import "server-only";
import { generateObject } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { extractedReceiptSchema, type ExtractedReceipt } from "./skladValidation";

// Model pro první Preview test: `openai/gpt-5-nano`, živě ověřený proti
// katalogu Vercel AI Gateway (ne jen výzkumem z téhle sandboxové sítě, co
// vercel.com/ai-gateway.vercel.sh blokuje — živé ověření udělala Lucy mimo
// tuhle session). Podporuje obrazový/PDF vstup, structured outputs, ZDR
// (zero data retention) a no-training. Je i mezi platnými ID v
// nainstalované verzi @ai-sdk/gateway@4.0.110 (GatewayModelId typ v
// node_modules). `has: ['vision','structured-output']` níž je navíc ŽIVÁ
// pojistka při skutečném volání — Gateway request sám odmítne, pokud model
// tyhle schopnosti nemá.
//
// Jediné místo v appce, kde je model ID — čte se z proměnné prostředí
// AI_GATEWAY_MODEL (fallback na nano, kdyby proměnná chyběla), NIKDY
// natvrdo na víc místech. Případný přechod na dražší `openai/gpt-5-mini`
// (po změření přesnosti na první ostré Penny účtence) je jen změna téhle
// jedné proměnné prostředí ve Vercelu — appka na to žádnou kódovou změnu
// nepotřebuje.
export const EXTRACTION_MODEL_ID = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5-nano";

export type ReceiptImageInput = { mimeType: string; bytes: Buffer };

const EXTRACTION_PROMPT = `Jsi asistent pro vytěžení dat z fotek účtenek/faktur z českých velkoobchodů a prodejen (např. Makro, Penny). Přečti VŠECHNY přiložené strany JAKO JEDEN DOKLAD (strany patří k sobě, mohou pokračovat přes stránky).

Vrať:
- dodavatele (název, IČO, DIČ, pokud jsou na dokladu uvedené),
- číslo dokladu a datum (formát YYYY-MM-DD),
- způsob platby, pokud je uvedený,
- KAŽDÝ řádek zboží/služby zvlášť: popis, dodavatelský kód zboží (skutečné číslo zboží/EAN/SKU, NE kód oddělení ani jiný pomocný kód), pomocný/neznámý kód (pokud je u řádku nějaký další kód, co nevypadá jako skutečné číslo zboží), počet nakoupených balení, kolik kusů/jednotek je v jednom balení, jednotku, jednotkovou cenu bez DPH, a CELKOVÉ částky za řádek bez DPH / DPH / s DPH PŘESNĚ jak jsou na dokladu,
- u KAŽDÉHO řádku navíc TVŮJ ODHAD (ne závazné rozhodnutí, jen pomocný návrh pro člověka): kategorie — jedna z "stock_material" (skladová surovina na výrobu nápojů), "resale_goods" (hotové zboží k dalšímu prodeji), "operating_supply" (provozní spotřeba, např. obaly/úklid), "non_stock_private" (vypadá jako soukromý/osobní nákup, ne firemní) — a stručný návrh názvu skladové karty a kanonické jednotky (např. "l", "kg", "ks"),
- celkové částky za celý doklad bez DPH / DPH / s DPH.

DŮLEŽITÉ: Číslo vedle ceny, co vypadá jako kód oddělení nebo kategorie (často krátký číselný kód, např. "23", "6"), NENÍ sazba DPH — nikdy si sazbu DPH nevymýšlej ani neurčuj z takového kódu. Stačí přepsat částky přesně tak, jak jsou na dokladu — sazbu si appka dopočítá sama z částek.

Pokud nějaký údaj na dokladu není nebo není čitelný, vrať pro něj null (nehádej, nevymýšlej si).`;

export async function extractReceiptData(images: ReceiptImageInput[]): Promise<ExtractedReceipt> {
  const { object } = await generateObject({
    model: gateway(EXTRACTION_MODEL_ID),
    schema: extractedReceiptSchema,
    schemaName: "ExtractedReceipt",
    providerOptions: {
      gateway: { has: ["vision", "structured-output"] },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACTION_PROMPT },
          ...images.map((image) => ({
            type: "image" as const,
            image: image.bytes,
            mediaType: image.mimeType,
          })),
        ],
      },
    ],
  });
  return object;
}
