// GPT/MCP pilot — zdroj dat pro výstupy asistenta (pravidla
// v dataSourceValidation.ts). Čte jen identifikaci Neon větve a čas
// poslední zaznamenané aktivity ve vybraných doménách — žádný obsah záznamů.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  copyInfo,
  domainActivity,
  environmentFromBranch,
  type DataDomain,
  type SourceInfo,
} from "./dataSourceValidation";
import { formatPragueDateTime } from "./callActivityValidation";

// Poslední zaznamenaná aktivita každé domény (jen informace, ne stáří DB).
// Pevné SQL (žádná část od uživatele); GREATEST ignoruje NULL.
const LATEST: Record<DataDomain, ReturnType<typeof sql>> = {
  crm: sql`GREATEST((SELECT max(created_at) FROM lead_activity), (SELECT max(updated_at) FROM leads))`,
  daily_calls: sql`(SELECT max(updated_at) FROM daily_call_queue)`,
  orders: sql`GREATEST((SELECT max(created_at) FROM orders), (SELECT max(created_at) FROM order_activity), (SELECT max(created_at) FROM payments))`,
  customers: sql`GREATEST((SELECT max(created_at) FROM organizations), (SELECT max(created_at) FROM orders WHERE buyer_organization_id IS NOT NULL))`,
  company: sql`GREATEST((SELECT max(created_at) FROM company_node_activity), (SELECT max(updated_at) FROM company_nodes))`,
  focus: sql`GREATEST((SELECT max(created_at) FROM focus_project_activity), (SELECT max(updated_at) FROM focus_projects))`,
};

export async function readDataSource(domains: DataDomain[], now: Date = new Date()): Promise<SourceInfo> {
  const unique = [...new Set(domains)];
  const columns = unique.map((d) => sql`${LATEST[d]} AS ${sql.identifier(d)}`);
  const query = sql`SELECT current_setting('neon.branch_id', true) AS branch_id${
    columns.length > 0 ? sql`, ${sql.join(columns, sql`, `)}` : sql``
  }`;
  const result = await db.execute(query);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const branchId = typeof row.branch_id === "string" && row.branch_id !== "" ? row.branch_id : null;

  return {
    deployment: process.env.VERCEL_ENV ?? "local",
    environment: environmentFromBranch(branchId),
    neonBranchId: branchId,
    copy: copyInfo(branchId, now),
    queriedAt: now.toISOString(),
    queriedAtPrague: formatPragueDateTime(now),
    activity: unique.map((d) => {
      const raw = row[d];
      const latest = raw === null || raw === undefined ? null : new Date(raw as string);
      return domainActivity(d, latest && !Number.isNaN(latest.getTime()) ? latest : null, now);
    }),
  };
}
