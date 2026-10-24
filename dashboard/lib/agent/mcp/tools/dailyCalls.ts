// GPT/MCP pilot — report denní fronty volání: plán vs. zaznamenané hovory
// (definice v lib/data/dailyCallReportValidation.ts).
import "server-only";
import { getDailyCallReport } from "@/lib/data/dailyCallReport";
import { MAX_CALL_ACTIVITY_DAYS, pragueToday, validatePragueDateRange } from "@/lib/data/callActivityValidation";
import { ArgError, optionalString } from "../args";
import { defineTool, type AgentTool } from "../define";
import { DATE_DESCRIPTION, periodOf, resolveSalesperson, sourceFor } from "./shared";

export const DAILY_CALL_TOOLS: AgentTool[] = [
  defineTool({
    name: "get_daily_call_report",
    title: "Report denní fronty volání",
    description:
      `Denní fronta volání za den nebo období (Europe/Prague, nejvýš ${MAX_CALL_ACTIVITY_DAYS} dní, výchozí dnes): ` +
      "naplánované kontakty a jejich stav (hotovo / čeká / odebráno), neodeslané koncepty, položky dokončené v období spárované se zaznamenaným hovorem, " +
      "nesoulady (hotovo bez zaznamenaného hovoru) a zaznamenané hovory mimo frontu. Volitelně jen pro jednoho obchodníka.",
    write: false,
    properties: {
      date_from: { type: "string", description: `První den ${DATE_DESCRIPTION} Výchozí dnes.` },
      date_to: { type: "string", description: `Poslední den (včetně) ${DATE_DESCRIPTION}` },
      salesperson: { type: "string", description: "Jméno nebo e-mail obchodníka (filtruje dokončené položky a hovory)." },
    },
    required: [],
    parse: (args) => {
      const dateFrom = optionalString(args, "date_from", 10);
      const dateTo = optionalString(args, "date_to", 10);
      if (dateFrom === null && dateTo !== null) throw new ArgError("K argumentu date_to chybí date_from.");
      return { dateFrom, dateTo, salesperson: optionalString(args, "salesperson", 100) };
    },
    execute: async ({ dateFrom, dateTo, salesperson }) => {
      const from = dateFrom ?? pragueToday(new Date());
      const range = validatePragueDateRange(from, dateTo, MAX_CALL_ACTIVITY_DAYS);
      if (!range.ok) return range;

      let personUserId: string | null = null;
      let personName: string | null = null;
      if (salesperson !== null) {
        const resolved = await resolveSalesperson(salesperson);
        if (!resolved.ok) return resolved;
        personUserId = resolved.person.userId;
        personName = resolved.person.name ?? resolved.person.email;
      }

      const report = await getDailyCallReport(range.value, personUserId);
      const warnings: string[] = [
        "Naplánované položky jsou uvedené s jejich SOUČASNÝM stavem; „čeká“ znamená, že k nim dosud není zaznamenaný výsledek.",
      ];
      if (personUserId !== null) {
        warnings.push("Plán fronty není rozdělený podle osob — filtr obchodníka se týká jen dokončených položek a zaznamenaných hovorů.");
      }
      if (report.totals.doneWithoutRecordedCall > 0) {
        warnings.push(`${report.totals.doneWithoutRecordedCall} dokončených položek nemá odpovídající zaznamenaný hovor.`);
      }

      return {
        ok: true,
        summary: { planned: report.totals.planned, doneInPeriod: report.totals.doneInPeriod },
        data: {
          salesperson: personName,
          ...report,
          source: await sourceFor(["daily_calls", "crm"], { period: periodOf(range.value), warnings }),
        },
      };
    },
  }),
];
