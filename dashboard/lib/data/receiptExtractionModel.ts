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
import { generateText, Output } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { rawExtractedReceiptSchema, type RawExtractedReceipt } from "./skladValidation";

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
// Primární (levný první pokus) model — čte se z proměnné prostředí
// AI_GATEWAY_MODEL (fallback na nano, kdyby proměnná chyběla), NIKDY
// natvrdo na víc místech.
export const EXTRACTION_MODEL_ID = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5-nano";

// Záložní (dražší) model pro PŘESNĚ JEDEN automatický druhý pokus, když
// primární model nad stejnými připravenými výřezy nevrátí ani jeden
// použitelný řádek (viz triggerGoodsReceiptExtraction v skladExtraction.ts
// — tam je i celá orchestrace: žádný další fallback, žádné nové
// preprocessing, stejná bezpečná validace i lidské potvrzení výsledku).
// Schválené explicitní rozhodnutí, proto napevno (ne přes proměnnou
// prostředí jako EXTRACTION_MODEL_ID) — jde o jediný definovaný záložní
// krok, ne o obecně přepínatelný model.
export const FALLBACK_EXTRACTION_MODEL_ID = "openai/gpt-5-mini";

export type ReceiptImageInput = { mimeType: string; bytes: Buffer };

const EXTRACTION_PROMPT = `Jsi asistent pro vytěžení dat z fotek účtenek/faktur z českých velkoobchodů a prodejen (např. Makro, Penny). Přečti VŠECHNY přiložené strany JAKO JEDEN DOKLAD (strany patří k sobě, mohou pokračovat přes stránky).

Dlouhá účtenka může být rozdělená na víc svisle PŘEKRÝVAJÍCÍCH SE výřezů v pořadí shora dolů (strana pokračuje přes víc obrázků kvůli délce). Stejný řádek se kvůli překryvu může objevit na dvou po sobě jdoucích výřezech — takový řádek vrať jen JEDNOU, nikdy duplicitně.

Vrať:
- dodavatele (název, IČO, DIČ, pokud jsou na dokladu uvedené),
- číslo dokladu a datum (formát YYYY-MM-DD),
- způsob platby, pokud je uvedený,
- KAŽDÝ řádek zboží/služby zvlášť: popis, dodavatelský kód zboží (skutečné číslo zboží/EAN/SKU, NE kód oddělení ani jiný pomocný kód), pomocný/neznámý kód (pokud je u řádku nějaký další kód, co nevypadá jako skutečné číslo zboží), počet nakoupených balení, kolik kusů/jednotek je v jednom balení, jednotku, jednotkovou cenu bez DPH, a CELKOVÉ částky za řádek bez DPH / DPH / s DPH PŘESNĚ jak jsou na dokladu,
- u KAŽDÉHO řádku navíc TVŮJ ODHAD (ne závazné rozhodnutí, jen pomocný návrh pro člověka): kategorie — jedna z "stock_material" (skladová surovina na výrobu nápojů), "resale_goods" (hotové zboží k dalšímu prodeji), "operating_supply" (provozní spotřeba, např. obaly/úklid), "non_stock_private" (vypadá jako soukromý/osobní nákup, ne firemní) — a stručný návrh názvu skladové karty a kanonické jednotky (např. "l", "kg", "ks"),
- celkové částky za celý doklad bez DPH / DPH / s DPH.

DŮLEŽITÉ: Číslo vedle ceny, co vypadá jako kód oddělení nebo kategorie (často krátký číselný kód, např. "23", "6"), NENÍ sazba DPH — nikdy si sazbu DPH nevymýšlej ani neurčuj z takového kódu. Stačí přepsat částky přesně tak, jak jsou na dokladu — sazbu si appka dopočítá sama z částek.

Pokud nějaký ÚDAJ na dokladu není nebo není čitelný, vrať pro něj null (nehádej, nevymýšlej si). Pokud je nečitelný/nerozluštitelný CELÝ ŘÁDEK (ne jen jedno pole), řádek STEJNĚ VRAŤ s neznámými poli jako null — nevynechávej ho a nevymýšlej si za něj hodnoty, appka takový řádek sama bezpečně rozpozná a vyřadí.`;

// `generateObject` je v nainstalované verzi `ai` zastaralé (@deprecated Use
// `generateText` with an `output` setting instead — node_modules/ai/dist/
// index.d.ts), proto `generateText` + `output: Output.object(...)`.
// Stejně tak `{type:'image', image, mediaType}` je zastaralé ve prospěch
// `{type:'file', mediaType, data}` (@deprecated poznámka u ImagePart v
// node_modules/@ai-sdk/provider-utils/dist/index.d.ts).
//
// Vrací RAW (nesanitizovaný) výstup — rawExtractedReceiptSchema je úmyslně
// shovívavé (nullable pole, žádné omezení kladnosti), aby jediný
// nečitelný/nulový řádek nevyhodil chybu validace za CELÝ strukturovaný
// výstup. skladExtraction.ts výsledek hned po návratu provede přes
// sanitizeExtractedReceipt (skladValidation.ts), co nečitelné/nesmyslné
// řádky bezpečně vyřadí.
//
// `modelId` je POVINNÝ a vždy explicitní na volajícím místě (EXTRACTION_MODEL_ID
// nebo FALLBACK_EXTRACTION_MODEL_ID) — žádný tichý výchozí model tady,
// ať je ve skladExtraction.ts na první pohled vidět, který pokus zrovna běží.
export async function extractReceiptData(images: ReceiptImageInput[], modelId: string): Promise<RawExtractedReceipt> {
  const { output } = await generateText({
    model: gateway(modelId),
    output: Output.object({ schema: rawExtractedReceiptSchema, name: "ExtractedReceipt" }),
    providerOptions: {
      gateway: { has: ["vision", "structured-output"] },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: EXTRACTION_PROMPT },
          ...images.map((image) => ({
            type: "file" as const,
            mediaType: image.mimeType,
            data: { type: "data" as const, data: image.bytes },
          })),
        ],
      },
    ],
  });
  return output;
}
