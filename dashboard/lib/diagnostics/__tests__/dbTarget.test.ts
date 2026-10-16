import { describe, expect, it } from "vitest";
import {
  PILOT_PREVIEW_DB,
  PRODUCTION_DB,
  connectionHostname,
  dbDiagnosticsAllowed,
  dbVerdict,
  deploymentInfo,
  neonEndpointId,
  plainHostname,
} from "../dbTarget";

const PILOT_HOST = "ep-bold-fire-b2x24ylv-pooler.c-6.eu-central-1.aws.neon.tech";
const PROD_HOST = "ep-orange-lake-b2zctiy8-pooler.c-6.eu-central-1.aws.neon.tech";
// Fiktivní údaje — test hlídá, že se z adresy nikdy nedostanou ven.
const USER = "neondb_owner";
const PASSWORD = "npg_TAJNEheslo123";

describe("dbDiagnosticsAllowed", () => {
  it("jen Preview a jen ADMIN", () => {
    expect(dbDiagnosticsAllowed({ VERCEL_ENV: "preview" }, "ADMIN")).toBe(true);
    expect(dbDiagnosticsAllowed({ VERCEL_ENV: "production" }, "ADMIN")).toBe(false);
    expect(dbDiagnosticsAllowed({ VERCEL_ENV: "development" }, "ADMIN")).toBe(false);
    expect(dbDiagnosticsAllowed({}, "ADMIN")).toBe(false);
    for (const role of ["EXECUTIVE", "EMPLOYEE", "CUSTOMER", null, undefined]) {
      expect(dbDiagnosticsAllowed({ VERCEL_ENV: "preview" }, role)).toBe(false);
    }
  });
});

describe("connectionHostname", () => {
  it("vrací jen hostname — bez uživatele, hesla, databáze a parametrů", () => {
    const url = `postgresql://${USER}:${PASSWORD}@${PILOT_HOST}/neondb?sslmode=require&channel_binding=require`;
    const host = connectionHostname(url);
    expect(host).toBe(PILOT_HOST);
    for (const secret of [USER, PASSWORD, "neondb", "sslmode", "@", ":"]) {
      expect(host).not.toContain(secret);
    }
  });

  it("postgres:// i mezery kolem", () => {
    expect(connectionHostname(`  postgres://${USER}:${PASSWORD}@${PROD_HOST}:5432/neondb  `)).toBe(PROD_HOST);
  });

  it("neplatná nebo chybějící adresa = null (žádný kus vstupu ven)", () => {
    expect(connectionHostname(undefined)).toBeNull();
    expect(connectionHostname("")).toBeNull();
    expect(connectionHostname(`${USER}:${PASSWORD}`)).toBeNull();
    expect(connectionHostname("nesmysl bez schématu")).toBeNull();
  });
});

describe("plainHostname", () => {
  it("propustí jen holý hostname", () => {
    expect(plainHostname(PILOT_HOST)).toBe(PILOT_HOST);
    expect(plainHostname(undefined)).toBeNull();
    expect(plainHostname(`${USER}:${PASSWORD}@${PILOT_HOST}`)).toBeNull();
    expect(plainHostname(`postgresql://${PILOT_HOST}`)).toBeNull();
  });
});

describe("neonEndpointId", () => {
  it("pooler i přímý hostname", () => {
    expect(neonEndpointId(PILOT_HOST)).toBe(PILOT_PREVIEW_DB.endpointId);
    expect(neonEndpointId("ep-bold-fire-b2x24ylv.c-6.eu-central-1.aws.neon.tech")).toBe(PILOT_PREVIEW_DB.endpointId);
    expect(neonEndpointId("ep-bold-fire-b2x24ylv.neonauth.c-6.eu-central-1.aws.neon.tech")).toBe(PILOT_PREVIEW_DB.endpointId);
    expect(neonEndpointId("localhost")).toBeNull();
    expect(neonEndpointId(null)).toBeNull();
  });
});

describe("dbVerdict", () => {
  const pilotServer = {
    branchId: PILOT_PREVIEW_DB.branchId,
    endpointId: PILOT_PREVIEW_DB.endpointId,
    timelineId: "c70254c51c443a004abce759abaa576d",
  };
  const pilotVars = { urlEndpointId: PILOT_PREVIEW_DB.endpointId, pgHostEndpointId: PILOT_PREVIEW_DB.endpointId };

  it("pilot jen když sedí proměnné i server", () => {
    expect(dbVerdict(pilotVars, pilotServer)).toBe("pilot");
  });

  it("jakákoli stopa Production = production", () => {
    expect(dbVerdict({ ...pilotVars, urlEndpointId: PRODUCTION_DB.endpointId }, pilotServer)).toBe("production");
    expect(dbVerdict({ ...pilotVars, pgHostEndpointId: PRODUCTION_DB.endpointId }, pilotServer)).toBe("production");
    expect(dbVerdict(pilotVars, { ...pilotServer, timelineId: PRODUCTION_DB.timelineId })).toBe("production");
    expect(dbVerdict(pilotVars, { ...pilotServer, branchId: PRODUCTION_DB.branchId })).toBe("production");
    expect(dbVerdict(pilotVars, { ...pilotServer, endpointId: PRODUCTION_DB.endpointId })).toBe("production");
  });

  it("chybějící údaj = unknown", () => {
    expect(dbVerdict(pilotVars, null)).toBe("unknown");
    expect(dbVerdict({ ...pilotVars, pgHostEndpointId: null }, pilotServer)).toBe("unknown");
    expect(dbVerdict(pilotVars, { ...pilotServer, branchId: null })).toBe("unknown");
  });

  it("jiná větev = other", () => {
    expect(dbVerdict(pilotVars, { ...pilotServer, branchId: "br-jina-vetev-12345678" })).toBe("other");
    expect(dbVerdict({ ...pilotVars, urlEndpointId: "ep-jiny-12345678" }, pilotServer)).toBe("other");
  });
});

describe("deploymentInfo", () => {
  it("bere jen systémové proměnné deploymentu", () => {
    const info = deploymentInfo({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_SHA: "90f0b59abc",
      VERCEL_GIT_COMMIT_REF: "claude/upbeat-goodall-pj64t5",
      VERCEL_DEPLOYMENT_ID: "dpl_123",
      VERCEL_URL: "mojebegina-abc123-jarin-max.vercel.app",
      DATABASE_URL: `postgresql://${USER}:${PASSWORD}@${PILOT_HOST}/neondb`,
    });
    expect(info).toEqual({
      environment: "preview",
      commitSha: "90f0b59abc",
      commitRef: "claude/upbeat-goodall-pj64t5",
      deploymentId: "dpl_123",
      deploymentHost: "mojebegina-abc123-jarin-max.vercel.app",
    });
    expect(JSON.stringify(info)).not.toContain(PASSWORD);
  });
});
