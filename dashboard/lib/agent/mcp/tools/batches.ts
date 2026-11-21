// Šarže (Lucie 21. 11. 2026) — Jarin může šarži zapsat i zprávou asistentovi
// („uvařil jsem 8 begin dýňové“). Jen pro Jaroslava a Lucii.
import "server-only";
import { getAuthContext } from "@/lib/data/authContext";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { AGENT_NAME_SUFFIX } from "@/lib/agent/oauthStore";
import { BATCH_VOLUMES, validateBatchInput } from "@/lib/vyroba/batches";
import {
  NO_BATCH_TABLE,
  batchSummaryText,
  batchesTableExists,
  createBatch,
  expiringLines,
  listBatchProducts,
  listBatches,
  todayPrague,
  type Batch,
} from "@/lib/vyroba/batchesServer";
import { ArgError, idempotencyKey } from "../args";
import { defineTool, type AgentTool } from "../define";

const DENIED = `Šarže smí zapisovat a číst jen ${INVOICE_ISSUER_NAMES}.`;
const issuerOnly = (ctx: Parameters<typeof isInvoiceIssuer>[0]) => isInvoiceIssuer(ctx);
const PAGE = "https://moje.begina.cz/rizeni-firmy/vyroba/sarze";

const brief = (b: Batch) => ({
  code: b.code,
  product: b.productName,
  producedOn: b.producedOn,
  lines: b.lines.map((l) => ({ package: l.label, volumeMl: l.volumeMl, quantity: l.quantity, bestBefore: l.bestBefore, soldOut: l.soldOut })),
  note: b.note,
  createdBy: b.createdByName,
});

export const BATCH_TOOLS: AgentTool[] = [
  defineTool({
    name: "list_batch_products",
    title: "Šarže — produkty k zápisu",
    description: "JEN ČTENÍ — produkty, které Begina vyrábí, s id a baleními (volume_ml). Použij před record_batch k nalezení product_id podle názvu.",
    write: false,
    visible: issuerOnly,
    properties: {},
    required: [],
    parse: () => null,
    execute: async () => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      const items = await listBatchProducts();
      return { ok: true, data: { products: items.map((p) => ({ id: p.id, name: p.name, category: p.categoryName, volumes: p.volumes })) } };
    },
  }),
  defineTool({
    name: "list_batches",
    title: "Šarže — přehled",
    description: "JEN ČTENÍ — posledních 50 šarží (číslo, produkt, datum výroby, balení, datum spotřeby, vyprodáno) a co končí do 3 dnů.",
    write: false,
    visible: issuerOnly,
    properties: {},
    required: [],
    parse: () => null,
    execute: async () => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      if (!(await batchesTableExists())) return { ok: false, error: NO_BATCH_TABLE };
      const batches = await listBatches(50);
      const expiring = expiringLines(batches, todayPrague(), 3).map((e) => ({ code: e.batch.code, product: e.batch.productName, package: e.line.label, bestBefore: e.line.bestBefore, daysLeft: e.daysLeft }));
      return { ok: true, summary: { batches: batches.length, expiring: expiring.length }, data: { batches: batches.map(brief), expiring, url: PAGE } };
    },
  }),
  defineTool({
    name: "record_batch",
    title: "Šarže — zapsat novou",
    description:
      "ZÁPIS — zapíše novou šarži, když Jarin oznámí, že uvařil/naplnil (např. „8 begin dýňové“). product_id zjisti přes list_batch_products. lines = balení a počty kusů: volume_ml 3000 (begina 3 l), 650 nebo 500 (sáček), 200 (ochutnávka polévky), 100 (ochutnávka sirupu). Datum spotřeby se dopočítá samo (polévky a čaje 3 týdny, sirup 3 l 6 měsíců, sáček 3 měsíce, ovocné nápoje 14 dní, koktejly 3 měsíce); best_before zadej jen když ho Jarin řekne jinak. Před zápisem uživateli řekni, co zapíšeš. Po zápisu mu sděl číslo šarže (patří na etiketu). Upozornění jde samo na info@begina.cz.",
    write: true,
    visible: issuerOnly,
    properties: {
      product_id: { type: "string", description: "id produktu z list_batch_products." },
      produced_on: { type: "string", description: "Datum výroby RRRR-MM-DD (výchozí dnes)." },
      lines: {
        type: "array",
        description: "Balení a počty kusů.",
        items: {
          type: "object",
          properties: {
            volume_ml: { type: "integer", enum: [...BATCH_VOLUMES] },
            quantity: { type: "integer", description: "Počet kusů 1–500." },
            best_before: { type: "string", description: "Jen když se liší od výchozí trvanlivosti: RRRR-MM-DD." },
          },
          required: ["volume_ml", "quantity"],
        },
      },
      note: { type: "string", description: "Poznámka (nepovinné, max. 500 znaků)." },
    },
    required: ["product_id", "lines"],
    parse: (args) => {
      const rawLines = Array.isArray(args.lines) ? (args.lines as Record<string, unknown>[]) : [];
      const parsed = validateBatchInput(
        {
          productId: args.product_id,
          producedOn: args.produced_on,
          note: args.note,
          lines: rawLines.map((l) => ({ volumeMl: l.volume_ml, quantity: l.quantity, bestBefore: l.best_before })),
        },
        todayPrague()
      );
      if (!parsed.ok) throw new ArgError(parsed.error);
      return { input: parsed.value, key: idempotencyKey(args) };
    },
    execute: async ({ input, key }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      if (!(await batchesTableExists())) return { ok: false, error: NO_BATCH_TABLE };
      const name = ctx.name ? ctx.name.replace(AGENT_NAME_SUFFIX, " (přes asistenta)") : null;
      const result = await createBatch(input, { userId: ctx.userId, name, source: "agent", sourceRef: key });
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        summary: { created: result.created },
        data: {
          created: result.created,
          batch: brief(result.batch),
          text: batchSummaryText(result.batch),
          notified: result.notified,
          message: result.created ? `Šarže ${result.batch.code} zapsaná.` : "Tato šarže už byla zapsaná dřív (stejný idempotency_key) — nic se nezapsalo podruhé.",
          url: PAGE,
        },
      };
    },
  }),
];
