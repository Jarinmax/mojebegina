// Mobilní tok 1.0 — AI vytěžení účtenky, FÁZE 2: strukturování OCR textu.
// Přepracování po druhém ostrém testu (Preview `61c9755`): appka teď
// NEPOSÍLÁ obrázky přímo do strukturovaného schématu — nejdřív čisté OCR
// (receiptOcrModel.ts, obrázky → prostý text), a AŽ TENHLE text se tady
// strukturuje do schématu. Oddělené od skladExtraction.ts (oprávnění, DB
// zápis, mapování), aby šlo v testech zmockovat JEN tenhle jeden export a
// testovat orchestraci/mapování na reálném kódu (stejný princip jako
// cleanupOrphanBlob/computeActualBlobSha256 v sklad.ts — izolovaný I/O na
// okraji, logika uvnitř testovatelná beze skutečné sítě).
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
import { isTruncatedByOutputLimit, logAiCallOutcome, ModelOutputTruncatedError } from "./aiCallDiagnostics";

// Jediný model pro strukturování — žádný automatický dražší fallback
// (druhý ostrý test na Preview `61c9755` ukázal, že záložní gpt-5-mini v
// PŮVODNÍM obrazovém kroku nepomohl; teď, když appka posílá jen OCR text,
// místo fallbacku na jiný model appka raději selže jasnou chybou — viz
// skladExtraction.ts). Čte se z proměnné prostředí AI_GATEWAY_MODEL
// (fallback na nano, kdyby proměnná chyběla), NIKDY natvrdo na víc místech.
export const EXTRACTION_MODEL_ID = process.env.AI_GATEWAY_MODEL?.trim() || "openai/gpt-5-nano";

const STRUCTURING_PROMPT = `Jsi asistent pro strukturování OCR přepisu účtenky/faktury z českých velkoobchodů a prodejen (např. Makro, Penny) do strukturovaných dat. Níže dostaneš přepis JEDNOHO dokladu — může být rozdělený na víc výřezů oddělených značkami "=== VÝŘEZ N ===" (doklad může pokračovat přes víc výřezů/stran, patří k sobě).

OCR mohl některé znaky přečíst špatně a sousední výřezy se mohly částečně překrývat — STEJNÝ řádek zboží se tak může v přepisu objevit DVAKRÁT ZA SEBOU, těsně na švu mezi výřezy (např. na konci jednoho "=== VÝŘEZ N ===" bloku a hned na začátku dalšího "=== VÝŘEZ N+1 ==="). Vrať ho jen JEDNOU, ale JEN pokud jsou splněné VŠECHNY tři podmínky zároveň: (1) oba výskyty jsou těsně u sebe přesně na tomhle švu mezi výřezy, (2) mají stejný dodavatelský kód, (3) mají stejné částky. Stejný dodavatelský kód NIKDY sám o sobě není důvod řádky sloučit nebo jeden vynechat — pokud se stejný kód objeví jinde v dokladu (ne na švu dvou výřezů), nebo se částky byť jen trochu liší, jde o DVĚ SAMOSTATNÉ nákupní položky a MUSÍŠ vrátit OBĚ. Stejně tak dvě RŮZNÉ položky s podobným názvem (např. stejná značka v různých příchutích nebo velikostech balení) NIKDY nepovažuj za duplicitu kvůli podobnému názvu. Každý řádek zboží je samostatná položka bez ohledu na to, kolik položek je pod stejným nadpisem kategorie (např. "ZPRACOVANÉ MASO") — nadpis kategorie není řádek zboží a nikdy nenahrazuje ani nespojuje řádky pod sebou.

U velkoobchodní faktury (na rozdíl od maloobchodní účtenky) bývá u váženého/odměřovaného zboží sloupec "BAL." s měrnou jednotkou (např. "KG", "L") a sloupec "počet MJ" s desetinným číslem — to NENÍ počet kusů/balení, je to SKUTEČNĚ NAKOUPENÉ MNOŽSTVÍ v téhle měrné jednotce (např. "počet MJ" 1,142 u "BAL. KG" znamená 1,142 kg skutečně nakoupeno, podobně u "L" litry). U takového řádku vrať packageQuantity jako 1, unitsPerPackage jako PŘESNĚ tohle vytištěné desetinné množství (např. 1,142), a unit jako tuhle měrnou jednotku (kg/l) — NIKDY nenahrazuj desetinné množství jedničkou jen proto, že nejde o "balení" v běžném smyslu. Jednotková cena (cena za kg/l) a celková cena řádku se u váženého zboží LIŠÍ (cena za jednotku × skutečné množství = celková cena) — to je u váženého zboží normální, ne chyba přepisu.

Vrať:
- dodavatele (název, IČO, DIČ, pokud jsou na dokladu uvedené),
- číslo dokladu a datum (formát YYYY-MM-DD),
- způsob platby, pokud je uvedený,
- KAŽDÝ řádek zboží/služby zvlášť: popis, dodavatelský kód zboží (skutečné číslo zboží/EAN/SKU, NE kód oddělení ani jiný pomocný kód), pomocný/neznámý kód (pokud je u řádku nějaký další kód, co nevypadá jako skutečné číslo zboží), počet nakoupených balení, kolik kusů/jednotek je v jednom balení, jednotku, jednotkovou cenu bez DPH, a CELKOVÉ částky za řádek bez DPH / DPH / s DPH PŘESNĚ jak jsou na dokladu,
- u KAŽDÉHO řádku navíc TVŮJ ODHAD (ne závazné rozhodnutí, jen pomocný návrh pro člověka): kategorie — jedna z "stock_material" (skladová surovina na výrobu nápojů), "resale_goods" (hotové zboží k dalšímu prodeji), "operating_supply" (provozní spotřeba, např. obaly/úklid), "non_stock_private" (vypadá jako soukromý/osobní nákup, ne firemní) — a stručný návrh názvu skladové karty a kanonické jednotky (např. "l", "kg", "ks"),
- celkové částky za celý doklad bez DPH / DPH / s DPH.

DŮLEŽITÉ: Číslo vedle ceny, co vypadá jako kód oddělení nebo kategorie (často krátký číselný kód, např. "23", "6"), NENÍ sazba DPH — nikdy si sazbu DPH nevymýšlej ani neurčuj z takového kódu. Stačí přepsat částky přesně tak, jak jsou v přepisu — sazbu si appka dopočítá sama z částek.

Maloobchodní účtenka (na rozdíl od velkoobchodní faktury) často NEUVÁDÍ počet balení ani rozpis ceny bez DPH/DPH po řádcích — jen název položky a jednu celkovou částku (obvykle s DPH). To je normální, ne chyba OCR. Když účtenka u položky množství vůbec netiskne (běžné u nákupu jednoho kusu), vrať packageQuantity jako 1 — ale pokud je na dokladu SKUTEČNĚ vytištěné jiné množství (např. "3 ks", "2x", "0,345 kg"), vrať PŘESNĚ tohle vytištěné číslo, nikdy ho nenahrazuj jedničkou. Stejně tak když účtenka neuvádí cenu bez DPH ani samostatnou DPH, vrať pro tahle pole null — nevymýšlej si je, appka si cenu bez DPH i DPH dopočítá sama z toho, co na dokladu skutečně je.

Pokud nějaký ÚDAJ v přepisu není nebo není čitelný, vrať pro něj null (nehádej, nevymýšlej si). Pokud je nečitelný/nerozluštitelný CELÝ ŘÁDEK (ne jen jedno pole, třeba kvůli značce "(nečitelné)"), řádek STEJNĚ VRAŤ s neznámými poli jako null — nevynechávej ho a nevymýšlej si za něj hodnoty, appka takový řádek sama bezpečně rozpozná a vyřadí.`;

// `generateObject` je v nainstalované verzi `ai` zastaralé (@deprecated Use
// `generateText` with an `output` setting instead — node_modules/ai/dist/
// index.d.ts), proto `generateText` + `output: Output.object(...)`.
//
// Vrací RAW (nesanitizovaný) výstup — rawExtractedReceiptSchema je úmyslně
// shovívavé (nullable pole, žádné omezení kladnosti), aby jediný
// nečitelný/nulový řádek nevyhodil chybu validace za CELÝ strukturovaný
// výstup. skladExtraction.ts výsledek hned po návratu provede přes
// sanitizeExtractedReceipt (skladValidation.ts), co nečitelné/nesmyslné
// řádky bezpečně vyřadí.
// `receiptId` je jen pro bezpečnou diagnostiku (aiCallDiagnostics.ts).
// `result.finishReason`/`result.usage` se čtou JEŠTĚ PŘED `result.output`
// — `.output` je getter, co při finishReason jiném než "stop" může sám
// vyhodit NoOutputGeneratedError (ověřeno v typech node_modules/ai), takže
// kdyby se čet output první, o finishReason bychom se u zkráceného
// výstupu vůbec nedozvěděli. Když model dosáhne výstupního limitu
// uprostřed strukturování (finishReason "length"), appka NEPŘIJME
// částečný/neúplný výsledek jako dokončené vytěžení — vyhodí
// ModelOutputTruncatedError a volající (skladExtraction.ts) na to
// reaguje jasnou technickou chybou, bez automatického dalšího (placeného)
// pokusu.
export async function extractStructuredReceipt(ocrText: string, receiptId: string): Promise<RawExtractedReceipt> {
  const result = await generateText({
    model: gateway(EXTRACTION_MODEL_ID),
    output: Output.object({ schema: rawExtractedReceiptSchema, name: "ExtractedReceipt" }),
    providerOptions: {
      gateway: { has: ["structured-output"] },
    },
    messages: [
      {
        role: "user",
        content: `${STRUCTURING_PROMPT}\n\n--- OCR PŘEPIS ---\n${ocrText}`,
      },
    ],
  });
  logAiCallOutcome({ receiptId, phase: "structuring", modelId: EXTRACTION_MODEL_ID, finishReason: result.finishReason, usage: result.usage });
  if (isTruncatedByOutputLimit(result.finishReason)) {
    throw new ModelOutputTruncatedError("structuring");
  }
  return result.output;
}
