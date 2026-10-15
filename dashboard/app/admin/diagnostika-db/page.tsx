// GPT/MCP pilot — diagnostika připojení k databázi pro Preview deployment.
// Ukáže, kam se TENTO deployment skutečně připojuje: hostname z DATABASE_URL
// (připojení lib/db/client.ts), hostname PGHOST (z něj se odvozuje Neon
// Auth) a co o sobě nahlásí samotný Postgres na druhé straně spojení
// (neon.branch_id / endpoint_id / timeline_id) — plus SHA deploymentu.
// Nikdy nezobrazuje connection string, uživatele, heslo ani název DB.
//
// Jen VERCEL_ENV=preview a jen aktivní role ADMIN; jinak 404. Layout /admin
// sice ADMIN hlídá taky, ale layout a stránka se renderují souběžně —
// kontrola proto musí být i tady, a to dřív než jakýkoli dotaz.
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { getAuthContext } from "@/lib/data/authContext";
import { deriveNeonAuthBaseUrl } from "@/lib/auth/neonAuthBaseUrl";
import {
  PILOT_PREVIEW_DB,
  connectionHostname,
  dbDiagnosticsAllowed,
  dbVerdict,
  deploymentInfo,
  neonEndpointId,
  plainHostname,
  type ServerReport,
  type Verdict,
} from "@/lib/diagnostics/dbTarget";

export const dynamic = "force-dynamic";

const VERDICT_TEXT: Record<Verdict, string> = {
  pilot: `Shoda: deployment používá Preview větev pilotu (${PILOT_PREVIEW_DB.branchId} / ${PILOT_PREVIEW_DB.endpointId}).`,
  production: "POZOR: deployment používá PRODUKČNÍ databázi. Nic nespouštět, nejdřív opravit propojení.",
  other: `Neshoda: deployment používá jinou větev než ${PILOT_PREVIEW_DB.branchId}. Migraci nespouštět.`,
  unknown: "Nelze rozhodnout — chybí některý údaj (viz níže). Migraci nespouštět.",
};

async function serverReport(): Promise<{ report: ServerReport | null; error: string | null }> {
  try {
    const result = await db.execute<{ branch_id: string | null; endpoint_id: string | null; timeline_id: string | null }>(sql`
      SELECT
        current_setting('neon.branch_id', true) AS branch_id,
        current_setting('neon.endpoint_id', true) AS endpoint_id,
        current_setting('neon.timeline_id', true) AS timeline_id
    `);
    const row = result.rows[0];
    return {
      report: {
        branchId: (row?.branch_id as string | null) || null,
        endpointId: (row?.endpoint_id as string | null) || null,
        timelineId: (row?.timeline_id as string | null) || null,
      },
      error: null,
    };
  } catch (error) {
    // Jen typ chyby — text může obsahovat detaily připojení.
    return { report: null, error: error instanceof Error ? error.name : "neznámá chyba" };
  }
}

function Value({ value }: { value: string | null }) {
  return value ? <span className="font-mono break-all">{value}</span> : <span className="text-neutral-400">není k dispozici</span>;
}

export default async function DbDiagnosticsPage() {
  const ctx = await getAuthContext();
  if (!ctx || ctx.roleSelectionRequired || !dbDiagnosticsAllowed(process.env, ctx.systemRole)) notFound();

  const deployment = deploymentInfo(process.env);
  const urlHost = connectionHostname(process.env.DATABASE_URL);
  const urlEndpoint = neonEndpointId(urlHost);
  const pgHost = plainHostname(process.env.PGHOST);
  const authUrl = deriveNeonAuthBaseUrl(process.env.PGHOST, process.env.PGDATABASE);
  const authHost = authUrl ? connectionHostname(authUrl) : null;
  const { report, error } = await serverReport();
  const verdict = dbVerdict({ urlEndpointId: urlEndpoint, pgHostEndpointId: neonEndpointId(pgHost) }, report);

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-medium text-begina-primary-900">Diagnostika databáze (Preview)</h1>
      <p className="mt-0.5 text-sm text-neutral-500">
        Kam se tento deployment skutečně připojuje. Jen čtení, bez hesel a bez connection stringu.
      </p>

      <p
        className={`mt-4 rounded-xl border p-4 text-sm font-medium ${
          verdict === "pilot"
            ? "border-green-300 bg-green-50 text-green-900"
            : "border-red-300 bg-red-50 text-red-900"
        }`}
      >
        {VERDICT_TEXT[verdict]}
      </p>

      <h2 className="mt-6 mb-2 text-sm font-medium text-begina-primary-900">Deployment</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <dt className="text-neutral-500">Prostředí</dt>
        <dd><Value value={deployment.environment} /></dd>
        <dt className="text-neutral-500">Commit SHA</dt>
        <dd><Value value={deployment.commitSha} /></dd>
        <dt className="text-neutral-500">Větev</dt>
        <dd><Value value={deployment.commitRef} /></dd>
        <dt className="text-neutral-500">Deployment ID</dt>
        <dd><Value value={deployment.deploymentId} /></dd>
        <dt className="text-neutral-500">Adresa deploymentu</dt>
        <dd><Value value={deployment.deploymentHost} /></dd>
      </dl>

      <h2 className="mt-6 mb-2 text-sm font-medium text-begina-primary-900">Připojení aplikace (proměnné)</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <dt className="text-neutral-500">DATABASE_URL → hostname</dt>
        <dd><Value value={urlHost} /></dd>
        <dt className="text-neutral-500">→ endpoint</dt>
        <dd><Value value={urlEndpoint} /></dd>
        <dt className="text-neutral-500">PGHOST</dt>
        <dd><Value value={pgHost} /></dd>
        <dt className="text-neutral-500">Neon Auth → hostname</dt>
        <dd><Value value={authHost} /></dd>
      </dl>

      <h2 className="mt-6 mb-2 text-sm font-medium text-begina-primary-900">Co hlásí databáze na druhé straně spojení</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
        <dt className="text-neutral-500">Větev (branch_id)</dt>
        <dd><Value value={report?.branchId ?? null} /></dd>
        <dt className="text-neutral-500">Endpoint</dt>
        <dd><Value value={report?.endpointId ?? null} /></dd>
        <dt className="text-neutral-500">Timeline</dt>
        <dd><Value value={report?.timelineId ?? null} /></dd>
        {error && (
          <>
            <dt className="text-neutral-500">Chyba dotazu</dt>
            <dd className="font-mono">{error}</dd>
          </>
        )}
      </dl>
      <p className="mt-3 text-xs text-neutral-500">
        Očekáváno pro pilot: {PILOT_PREVIEW_DB.endpointId} v DATABASE_URL, PGHOST, Neon Auth i u databáze a větev {PILOT_PREVIEW_DB.branchId}.
      </p>
    </div>
  );
}
