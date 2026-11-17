// PROJEKT BEGINA 1.0 — nástroje asistenta pro sdílenou paměť firmy
// (project_entries). Jen pro Jaroslava a Lucii (isInvoiceIssuer).
// Zápis jen přidává řádky (nový stav, rozhodnutí, výstup) — nic nemaže ani nepřepisuje.
import "server-only";
import { getAuthContext } from "@/lib/data/authContext";
import { INVOICE_ISSUER_NAMES, isInvoiceIssuer } from "@/lib/data/invoiceAuth";
import { AGENT_NAME_SUFFIX } from "@/lib/agent/oauthStore";
import { KIND_LABELS, PROJECT_AREAS, PROJECT_AREA_SLUGS, PROJECT_KINDS, findArea, validateProjectInput } from "@/lib/projekt/areas";
import { insertProjectEntry, loadArea, loadOverview, projectTableExists, type ProjectEntry } from "@/lib/projekt/projectServer";
import { ArgError, idempotencyKey, requiredString } from "../args";
import { defineTool, type AgentTool } from "../define";

const DENIED = `Projekt Begina smí číst a zapisovat jen ${INVOICE_ISSUER_NAMES}.`;
const NO_TABLE = "Projekt Begina v databázi ještě není — je potřeba spustit v Neonu skript 125_projekt_begina_MAIN.";
const issuerOnly = (ctx: Parameters<typeof isInvoiceIssuer>[0]) => isInvoiceIssuer(ctx);
const BASE_URL = "https://moje.begina.cz/rizeni-firmy/projekt";
const AREA_HELP = PROJECT_AREAS.map((a) => `${a.slug} = ${a.name}`).join(", ");

const brief = (e: ProjectEntry) => ({
  area: e.area,
  kind: e.kind,
  kindLabel: KIND_LABELS[e.kind],
  date: e.entryDate,
  title: e.title,
  text: e.body,
  url: e.url,
  author: e.createdByName,
});

export const PROJECT_TOOLS: AgentTool[] = [
  defineTool({
    name: "project_overview",
    title: "Projekt Begina — přehled oblastí",
    description: `JEN ČTENÍ — přehled Projektu Begina (sdílená paměť firmy): u každé oblasti aktuální stav a počty rozhodnutí a výstupů, plus posledních 10 zápisů. Oblasti: ${AREA_HELP}.`,
    write: false,
    visible: issuerOnly,
    properties: {},
    required: [],
    parse: () => null,
    execute: async () => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      if (!(await projectTableExists())) return { ok: false, error: NO_TABLE };
      const { areas, recent } = await loadOverview(10);
      return {
        ok: true,
        data: {
          areas: areas.map((a) => ({
            area: a.slug,
            name: findArea(a.slug)?.name,
            status: a.status?.body ?? null,
            statusDate: a.status?.entryDate ?? null,
            decisions: a.decisions,
            outputs: a.outputs,
            url: `${BASE_URL}/${a.slug}`,
          })),
          recent: recent.map(brief),
          url: BASE_URL,
        },
      };
    },
  }),
  defineTool({
    name: "project_read_area",
    title: "Projekt Begina — jedna oblast",
    description:
      "JEN ČTENÍ — celá oblast Projektu Begina: aktuální stav, všechna rozhodnutí a výstupy (nejnovější první). Načti ji na začátku práce v dané oblasti, ať uživatelé nemusí nic opakovat, a před zápisem rozhodnutí ověř, že už tam není.",
    write: false,
    visible: issuerOnly,
    properties: { area: { type: "string", enum: [...PROJECT_AREA_SLUGS], description: AREA_HELP } },
    required: ["area"],
    parse: (args) => {
      const area = findArea(requiredString(args, "area", 40));
      if (!area) throw new ArgError(`Neznámá oblast. Povolené: ${PROJECT_AREA_SLUGS.join(", ")}.`);
      return area.slug;
    },
    execute: async (area) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      if (!(await projectTableExists())) return { ok: false, error: NO_TABLE };
      const data = await loadArea(area);
      return {
        ok: true,
        summary: { decisions: data.decisions.length, outputs: data.outputs.length },
        data: {
          area,
          name: findArea(area)?.name,
          status: data.status ? brief(data.status) : null,
          decisions: data.decisions.slice(0, 100).map(brief),
          outputs: data.outputs.slice(0, 100).map(brief),
          url: `${BASE_URL}/${area}`,
        },
      };
    },
  }),
  defineTool({
    name: "project_write",
    title: "Projekt Begina — zapsat",
    description:
      "ZÁPIS — přidá do oblasti Projektu Begina jeden zápis: kind=status (nový aktuální stav oblasti — CELÝ krátký odstavec, nahradí zobrazený stav, starý zůstane v historii), kind=decision (rozhodnutí: title = co se rozhodlo jednou větou, text = proč, nepovinné), kind=output (hotový výstup: title = název, url = odkaz, text = poznámka). Volej, když uživatel řekne „zapiš to / zaznamenej to“; zapisuj stručně a jen to, co uživatel řekl nebo schválil, nic si nedomýšlej. Po zápisu uživateli jednou větou řekni, co a kam jsi zapsal.",
    write: true,
    visible: issuerOnly,
    properties: {
      area: { type: "string", enum: [...PROJECT_AREA_SLUGS], description: AREA_HELP },
      kind: { type: "string", enum: [...PROJECT_KINDS], description: "status = stav, decision = rozhodnutí, output = výstup." },
      title: { type: "string", description: "Rozhodnutí: co se rozhodlo (1 věta). Výstup: název. U stavu se nevyplňuje. Max. 200 znaků." },
      text: { type: "string", description: "Stav: kde to teď je (povinné). Rozhodnutí/výstup: podrobnosti (nepovinné). Max. 2000 znaků." },
      url: { type: "string", description: "Jen výstup: odkaz https:// na dokument, tabulku, obrázek…" },
      date: { type: "string", description: "Datum rozhodnutí RRRR-MM-DD, když nebylo dnes (nepovinné)." },
    },
    required: ["area", "kind"],
    parse: (args) => {
      const parsed = validateProjectInput({ area: args.area, kind: args.kind, title: args.title, body: args.text, url: args.url });
      if (!parsed.ok) throw new ArgError(parsed.error);
      const rawDate = typeof args.date === "string" ? args.date.trim() : "";
      if (rawDate && (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(Date.parse(rawDate)))) throw new ArgError("Argument date musí být RRRR-MM-DD.");
      return { input: parsed.value, date: rawDate || undefined, key: idempotencyKey(args) };
    },
    execute: async ({ input, date, key }) => {
      const ctx = await getAuthContext();
      if (!ctx || !isInvoiceIssuer(ctx)) return { ok: false, error: DENIED };
      if (!(await projectTableExists())) return { ok: false, error: NO_TABLE };
      const name = ctx.name ? ctx.name.replace(AGENT_NAME_SUFFIX, " (přes asistenta)") : null;
      const created = await insertProjectEntry(input, { userId: ctx.userId, name, source: "agent", sourceRef: key, entryDate: date });
      const areaName = findArea(input.area)?.name;
      return {
        ok: true,
        summary: { created },
        data: {
          created,
          message: created ? `${KIND_LABELS[input.kind]} zapsán${input.kind === "decision" ? "o" : ""} do oblasti ${areaName}.` : "Tento zápis už dřív proběhl (stejný idempotency_key) — nic se nezapsalo podruhé.",
          url: `${BASE_URL}/${input.area}`,
        },
      };
    },
  }),
];
