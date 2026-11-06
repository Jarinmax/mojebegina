// GPT/MCP pilot — manažerský přehled Beginy (souhrnná čísla napříč
// doménami + kvalita dat). Datová část v lib/data/executiveOverview.ts.
import "server-only";
import {
  overviewCalls,
  overviewCompany,
  overviewCrm,
  overviewCustomers,
  overviewDailyQueue,
  overviewFocus,
  overviewOrders,
} from "@/lib/data/executiveOverview";
import { pragueToday, shiftDate, validatePragueDateRange, type CallActivityRange } from "@/lib/data/callActivityValidation";
import { ArgError, optionalEnum, optionalString } from "../args";
import { defineTool, type AgentTool } from "../define";
import { DATE_DESCRIPTION, periodOf, section, sourceFor, type Section } from "./shared";

const PERIODS = ["today", "week", "month", "quarter", "year", "all"] as const;
type PeriodPreset = (typeof PERIODS)[number];
const PERIOD_DAYS: Record<Exclude<PeriodPreset, "all">, number> = { today: 1, week: 7, month: 30, quarter: 92, year: 365 };

const value = <T, K extends keyof T>(s: Section<T>, key: K): T[K] | null => (s.available ? s.data[key] : null);

export const OVERVIEW_TOOLS: AgentTool[] = [
  defineTool({
    name: "get_executive_overview",
    title: "Manažerský přehled Beginy",
    description:
      "Stručný manažerský přehled jen ze souhrnných čísel: leady (aktivní, nové, po termínu, bez dalšího kroku), zaznamenané hovory po obchodnících, " +
      "denní fronta, objednávky (počet, obrat, nezaplacené, vyžadující zásah, storna, vratky), zákazníci (dlouho bez objednávky), Živá mapa firmy " +
      "(problémová a stagnující témata), CEO projekty a přehled neúplných záznamů (dataQuality). Období: předvolba nebo date_from/date_to — " +
      "souhrny smí pokrýt i celý rok, víc let nebo celou historii (period = all). Sekce s available=false nejsou nula, ale nedostupná data.",
    write: false,
    properties: {
      period: { type: "string", enum: [...PERIODS], description: "today, week (7 dní, výchozí), month (30), quarter (92), year (365), all (celá historie)." },
      date_from: { type: "string", description: `Místo předvolby: první den ${DATE_DESCRIPTION}` },
      date_to: { type: "string", description: `Místo předvolby: poslední den (včetně) ${DATE_DESCRIPTION}` },
      stale_days: { type: "integer", minimum: 1, maximum: 365, description: "Téma v Živé mapě je „stagnující“, když nemá aktivitu tolik dní (výchozí 14)." },
    },
    required: [],
    parse: (args) => {
      const period = optionalEnum(args, "period", PERIODS);
      const dateFrom = optionalString(args, "date_from", 10);
      const dateTo = optionalString(args, "date_to", 10);
      if (period !== null && dateFrom !== null) throw new ArgError("Zadejte buď period, nebo date_from/date_to, ne obojí.");
      if (dateFrom === null && dateTo !== null) throw new ArgError("K argumentu date_to chybí date_from.");
      const staleDays = args.stale_days ?? 14;
      if (typeof staleDays !== "number" || !Number.isInteger(staleDays) || staleDays < 1 || staleDays > 365) {
        throw new ArgError("Argument stale_days musí být celé číslo 1–365.");
      }
      return { period: period ?? (dateFrom ? null : ("week" as PeriodPreset)), dateFrom, dateTo, staleDays };
    },
    execute: async ({ period, dateFrom, dateTo, staleDays }) => {
      const now = new Date();
      const today = pragueToday(now);
      let range: CallActivityRange | null = null;
      if (dateFrom !== null) {
        const r = validatePragueDateRange(dateFrom, dateTo, null);
        if (!r.ok) return r;
        range = r.value;
      } else if (period !== null && period !== "all") {
        const r = validatePragueDateRange(shiftDate(today, -(PERIOD_DAYS[period] - 1)), today, null);
        if (r.ok) range = r.value;
      }

      const [crm, calls, dailyQueue, orders, customers, company, focus] = await Promise.all([
        section("crm", () => overviewCrm(range, today)),
        section("calls", () => overviewCalls(range)),
        section("dailyQueue", () => overviewDailyQueue(today, range)),
        section("orders", () => overviewOrders(range, today)),
        section("customers", () => overviewCustomers(range, today)),
        section("company", () => overviewCompany(staleDays, now)),
        section("focus", () => overviewFocus()),
      ]);

      const dataQuality = {
        callsWithoutResult: value(calls, "callsWithoutResult"),
        callsWithoutNote: value(calls, "callsWithoutNote"),
        activeLeadsMissingNextStep: value(crm, "missingNextStep"),
        activeLeadsOverdue: value(crm, "overdue"),
        activeLeadsWithoutOwner: value(crm, "activeWithoutOwner"),
        convertedLeadsWithoutCustomer: value(crm, "convertedWithoutCustomer"),
        queueDoneWithoutRecordedCall: value(dailyQueue, "doneWithoutRecordedCall"),
        ordersWithoutCustomerLinkInPeriod: value(orders, "ordersWithoutCustomerLinkInPeriod"),
        customersWithoutOwner: value(customers, "withoutOwner"),
        note: "null = údaj nedostupný (chybí oprávnění nebo chyba), 0 = skutečně žádný neúplný záznam. Hovory v období podle data zápisu.",
      };

      return {
        ok: true,
        summary: { sections: 7, unavailable: [crm, calls, dailyQueue, orders, customers, company, focus].filter((s) => !s.available).length },
        data: {
          today,
          sections: { crm, recordedCalls: calls, dailyQueue, orders, customers, companyMap: company, ceoProjects: focus },
          dataQuality,
          legend: {
            zero: "0 u dostupné sekce = skutečně nula v uložených datech.",
            unavailable: "available=false = data nejsou k dispozici (oprávnění nebo chyba), NEJDE o nulu.",
            notRecorded: "Systém zná jen zaznamenané hovory a zápisy; co obchodník nezapsal, v datech není.",
            incomplete: "dataQuality = záznamy, kterým chybí výsledek, poznámka, další krok nebo vazba.",
            staleCopy: "source.warnings upozorní na Preview kopii a její stáří; source.lastRecordedActivity je jen informace, kdy se v doméně naposledy něco zapsalo (stará aktivita ≠ zastaralá databáze).",
          },
          source: await sourceFor(["crm", "daily_calls", "orders", "customers", "company", "focus"], {
            period: range ? periodOf(range) : { dateFrom: null, dateTo: null, timeZone: "Europe/Prague", note: "celá dostupná historie" },
            warnings: [
              "Počty leadů po termínu, bez dalšího kroku a nezaplacených objednávek jsou AKTUÁLNÍ stav, ne stav v období.",
              "Úkoly v Živé mapě ani CEO projekty nemají termíny — místo „po termínu“ se uvádí stav a stagnace.",
            ],
          }),
        },
      };
    },
  }),
];
