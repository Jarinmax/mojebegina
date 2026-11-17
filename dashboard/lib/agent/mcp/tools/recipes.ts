// NÁKUPY SUROVIN 1.0 — nástroje asistenta pro Ceník surovin a obalů
// (Řízení firmy → Receptury a náklady → Ceník) a nabídky dodavatelů s odkazy.
// Jen pro Jaroslava a Lucii (isInvoiceIssuer). Receptury (množství) jsou
// výrobní tajemství — nástroje vracejí jen názvy výrobků a náklad na beginu.
import "server-only";
import { getAuthContext } from "@/lib/data/authContext";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { isOfferInUse, lowestRegularUnitPriceKc, offerUnitPriceKc, priceChangeImpact, safeOfferUrl, type RecipeOffer } from "@/lib/receptury/recipes";
import { deleteOffer, loadOffers, loadRecipes, offerTableExists, recipeTablesExist, saveOffer, updateIngredientPrice } from "@/lib/receptury/recipesServer";
import { ArgError, optionalBoolean, optionalString, requiredString, requiredUuid } from "../args";
import { defineTool, type AgentTool } from "../define";

const DENIED = `Ceník surovin smí číst a upravovat jen ${INVOICE_ISSUER_NAMES}.`;
const NO_TABLES = "Receptury a ceník v databázi ještě nejsou (skript 123).";
const NO_OFFERS = "Nabídky dodavatelů v databázi ještě nejsou — je potřeba spustit v Neonu skript 128_nakupy_surovin_MAIN.";
const CENIK_URL = "https://moje.begina.cz/rizeni-firmy/receptury/cenik";
const issuerOnly = (ctx: Parameters<typeof isInvoiceIssuer>[0]) => isInvoiceIssuer(ctx);
const round2 = (kc: number) => Math.round(kc * 100) / 100;

function requiredNumber(args: Record<string, unknown>, key: string, { min = 0, positive = false } = {}): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || (positive && value <= 0) || value >= 100_000_000) {
    throw new ArgError(`Argument ${key} musí být ${positive ? "kladné" : "nezáporné"} číslo.`);
  }
  return value;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | null {
  return args[key] === undefined || args[key] === null ? null : requiredNumber(args, key);
}

function ingredientCode(args: Record<string, unknown>): string {
  const code = requiredString(args, "ingredient_code", 60);
  if (!/^[a-z0-9-]+$/.test(code)) throw new ArgError("Argument ingredient_code je kód suroviny z recipes_price_list (např. sencha).");
  return code;
}

async function guard(): Promise<{ userId: string } | { error: string }> {
  const ctx = await getAuthContext();
  if (!ctx || !isInvoiceIssuer(ctx)) return { error: DENIED };
  if (!(await recipeTablesExist())) return { error: NO_TABLES };
  return { userId: ctx.userId };
}

const offerOut = (offer: RecipeOffer, ingredientPriceKc: number | null) => ({
  id: offer.id,
  itemName: offer.itemName,
  url: offer.url,
  packLabel: offer.packLabel,
  packQty: offer.packQty,
  priceKc: offer.priceKc,
  shippingKc: offer.shippingKc,
  unitPriceKc: offerUnitPriceKc(offer),
  isPromo: offer.isPromo,
  inUse: ingredientPriceKc !== null && isOfferInUse(offer, ingredientPriceKc),
  note: offer.note,
});

export const RECIPE_TOOLS: AgentTool[] = [
  defineTool({
    name: "recipes_price_list",
    title: "Ceník surovin — přehled s nabídkami",
    description:
      "JEN ČTENÍ — Ceník surovin a obalů z Receptur a nákladů: u každé položky kód, cena za jednotku (kg/l/ks/kapka, včetně dopravy), ve kterých výrobcích se používá, nejnižší běžná cena z nabídek a nabídky dodavatelů (odkaz, balení, cena, doprava, cena za jednotku, akce, která se dnes počítá). query = filtr podle názvu nebo kódu. Plus ostatní nákupy mimo receptury. Množství z receptur nevrací (výrobní tajemství).",
    write: false,
    visible: issuerOnly,
    properties: { query: { type: "string", description: "Nepovinný filtr (část názvu nebo kódu), např. „meduňka“." } },
    required: [],
    parse: (args) => optionalString(args, "query", 60)?.toLocaleLowerCase("cs") ?? null,
    execute: async (query) => {
      const g = await guard();
      if ("error" in g) return { ok: false, error: g.error };
      const [{ recipes, ingredients }, offers, hasOffers] = await Promise.all([loadRecipes(), loadOffers(), offerTableExists()]);
      const match = (text: string) => !query || text.toLocaleLowerCase("cs").includes(query);
      const items = ingredients
        .filter((item) => match(item.name) || match(item.code))
        .map((item) => {
          const own = offers.filter((offer) => offer.ingredientId === item.id);
          return {
            id: item.id,
            code: item.code,
            name: item.name,
            kind: item.kind,
            priceUnit: item.priceUnit,
            priceKc: item.priceKc,
            usedIn: recipes.filter((recipe) => !recipe.archived && recipe.items.some((row) => row.ingredient.id === item.id)).map((recipe) => recipe.name),
            lowestRegularUnitPriceKc: lowestRegularUnitPriceKc(own),
            offers: own.map((offer) => offerOut(offer, item.priceKc)),
          };
        });
      const other = offers.filter((offer) => offer.ingredientId === null && match(offer.itemName)).map((offer) => offerOut(offer, null));
      return {
        ok: true,
        summary: { count: items.length },
        data: { count: items.length, items, otherPurchases: other, offersAvailable: hasOffers, ...(hasOffers ? {} : { warning: NO_OFFERS }), url: CENIK_URL },
      };
    },
  }),
  defineTool({
    name: "recipes_set_price",
    title: "Ceník surovin — změnit cenu",
    description:
      "ZÁPIS — změní cenu suroviny nebo obalu v Ceníku (za kg/l/ks/kapku, včetně dopravy). Tím se přepočítají náklady a marže všech receptur, kde se používá. Vrací starou a novou cenu a u každého dotčeného výrobku náklad na beginu (3 l) před a po. S dry_run=true jen spočítá dopad a nic nezapíše — použij pro náhled a zapiš až po souhlasu uživatele.",
    write: true,
    visible: issuerOnly,
    properties: {
      ingredient_code: { type: "string", description: "Kód položky z recipes_price_list (např. sencha, bag-3l)." },
      price_kc: { type: "number", description: "Nová cena v Kč za jednotku ceníku (kg / l / ks / kapka)." },
      dry_run: { type: "boolean", description: "true = jen náhled dopadu, nic se nezapíše." },
    },
    required: ["ingredient_code", "price_kc"],
    parse: (args) => ({ code: ingredientCode(args), priceKc: Math.round(requiredNumber(args, "price_kc") * 10_000) / 10_000, dryRun: optionalBoolean(args, "dry_run") === true }),
    execute: async ({ code, priceKc, dryRun }) => {
      const g = await guard();
      if ("error" in g) return { ok: false, error: g.error };
      const { recipes, ingredients } = await loadRecipes();
      const item = ingredients.find((row) => row.code === code);
      if (!item) return { ok: false, error: `Položka s kódem „${code}“ v Ceníku není — kódy vypíše recipes_price_list.` };
      const impact = priceChangeImpact(recipes, item.id, priceKc);
      if (!dryRun) await updateIngredientPrice(item.id, priceKc, null, g.userId);
      return {
        ok: true,
        summary: { written: !dryRun, affected: impact.length },
        data: {
          written: !dryRun,
          message: dryRun ? "Jen náhled — nic se nezapsalo." : `Cena „${item.name}“ je uložená, receptury jsou přepočítané.`,
          name: item.name,
          priceUnit: item.priceUnit,
          oldPriceKc: item.priceKc,
          newPriceKc: priceKc,
          affectedProducts: impact,
          url: CENIK_URL,
        },
      };
    },
  }),
  defineTool({
    name: "recipes_save_offer",
    title: "Ceník surovin — uložit nabídku dodavatele",
    description:
      "ZÁPIS — přidá nebo upraví nabídku dodavatele (odkaz na e-shop, balení, cena, doprava). Nová nabídka: ingredient_code (bez něj = ostatní nákupy mimo receptury). Úprava: offer_id z recipes_price_list. pack_qty je množství v balení v jednotce ceníku suroviny (kg / l / ks / kapka; esenciální olej 30 ml = 750 kapek, 15 ml = 375 kapek). Cenu v Ceníku nemění — k tomu recipes_set_price.",
    write: true,
    visible: issuerOnly,
    properties: {
      offer_id: { type: "string", description: "id nabídky při úpravě (UUID); u nové vynech." },
      ingredient_code: { type: "string", description: "Kód suroviny / obalu, ke které nabídka patří (jen u nové nabídky)." },
      item_name: { type: "string", description: "Název nabídky, např. „Meduňka lékařská nať 5 kg – profikoreni.cz“." },
      url: { type: "string", description: "Odkaz na nákup (https://…)." },
      pack_label: { type: "string", description: "Balení slovy, např. „5 kg“, „30 ml (750 kapek)“." },
      pack_qty: { type: "number", description: "Množství v balení v jednotce ceníku (kg / l / ks / kapka)." },
      price_kc: { type: "number", description: "Cena balení v Kč." },
      shipping_kc: { type: "number", description: "Doprava v Kč (výchozí 0)." },
      is_promo: { type: "boolean", description: "true = do nákladů se nepočítá (akční cena nebo balení, které nebereme — např. 700 ks bagů, 100 ml oleje)." },
      note: { type: "string", description: "Krátká poznámka (max. 300 znaků)." },
    },
    required: ["item_name", "pack_label", "pack_qty", "price_kc"],
    parse: (args) => {
      const rawUrl = optionalString(args, "url", 1000);
      const url = safeOfferUrl(rawUrl);
      if (rawUrl && !url) throw new ArgError("Argument url musí být odkaz https://…");
      return {
        offerId: args.offer_id ? requiredUuid(args, "offer_id") : null,
        code: args.ingredient_code ? ingredientCode(args) : null,
        itemName: requiredString(args, "item_name", 200),
        url,
        packLabel: requiredString(args, "pack_label", 60),
        packQty: requiredNumber(args, "pack_qty", { positive: true }),
        priceKc: round2(requiredNumber(args, "price_kc")),
        shippingKc: round2(optionalNumber(args, "shipping_kc") ?? 0),
        isPromo: optionalBoolean(args, "is_promo") === true,
        note: optionalString(args, "note", 300),
      };
    },
    execute: async (input) => {
      const g = await guard();
      if ("error" in g) return { ok: false, error: g.error };
      if (!(await offerTableExists())) return { ok: false, error: NO_OFFERS };
      const [{ ingredients }, offers] = await Promise.all([loadRecipes(), loadOffers()]);
      let ingredientId: string | null = null;
      if (input.offerId) {
        const existing = offers.find((offer) => offer.id === input.offerId);
        if (!existing) return { ok: false, error: "Nabídka s tímto id neexistuje." };
        ingredientId = existing.ingredientId;
      } else if (input.code) {
        const item = ingredients.find((row) => row.code === input.code);
        if (!item) return { ok: false, error: `Položka s kódem „${input.code}“ v Ceníku není.` };
        ingredientId = item.id;
      }
      // Opakovaný zápis téže nové nabídky (stejná položka, název a balení) jen upraví tu první.
      const duplicate = input.offerId ? null : offers.find((offer) => offer.ingredientId === ingredientId && offer.itemName === input.itemName && offer.packLabel === input.packLabel);
      const id = await saveOffer(input.offerId ?? duplicate?.id ?? null, { ingredientId, itemName: input.itemName, url: input.url, packLabel: input.packLabel, packQty: input.packQty, priceKc: input.priceKc, shippingKc: input.shippingKc, isPromo: input.isPromo, note: input.note }, g.userId);
      if (!id) return { ok: false, error: "Nabídku se nepodařilo uložit." };
      const unitPriceKc = offerUnitPriceKc(input);
      return { ok: true, summary: { created: !input.offerId && !duplicate }, data: { id, unitPriceKc, message: `Nabídka uložená — vychází na ${unitPriceKc} Kč za jednotku včetně dopravy.`, url: CENIK_URL } };
    },
  }),
  defineTool({
    name: "recipes_delete_offer",
    title: "Ceník surovin — smazat nabídku",
    description: "ZÁPIS — smaže nabídku dodavatele (offer_id z recipes_price_list). Cenu v Ceníku nemění.",
    write: true,
    visible: issuerOnly,
    properties: { offer_id: { type: "string", description: "id nabídky (UUID)." } },
    required: ["offer_id"],
    parse: (args) => requiredUuid(args, "offer_id"),
    execute: async (offerId) => {
      const g = await guard();
      if ("error" in g) return { ok: false, error: g.error };
      if (!(await offerTableExists())) return { ok: false, error: NO_OFFERS };
      if (!(await deleteOffer(offerId))) return { ok: false, error: "Nabídka s tímto id neexistuje." };
      return { ok: true, summary: { deleted: true }, data: { deleted: true, url: CENIK_URL } };
    },
  }),
];
