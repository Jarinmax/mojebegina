// ESHOP 1.0 — testovací "Neon" v paměti pro ověření e-shopu v prohlížeči
// BEZ přístupu k Neonu. Nikdy se nepoužívá v produkci ani v kódu aplikace.
//
// Ovladač @neondatabase/serverless (neon-http) posílá dotazy jako HTTP POST
// na https://api.<host>/sql. Tento preload v Node procesu přesměruje právě
// tyto požadavky na PGlite (Postgres v paměti) se všemi migracemi z
// drizzle/ (včetně 0012 + 0013) a vrátí odpověď ve formátu Neonu (surový
// text + OID typů, jako skutečný Neon s "Neon-Raw-Text-Output").
//
// Spuštění (build musí proběhnout předem; E2E_SQL_PORT volitelně, viz konec souboru):
//   DATABASE_URL=postgresql://u:p@ep-test.neon.tech/neondb \
//   NODE_OPTIONS="--import ./scripts/eshop-e2e/neon-http-pglite.mjs" npx next start
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const DRIZZLE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

const pg = new PGlite();
const ready = (async () => {
  const journal = JSON.parse(readFileSync(join(DRIZZLE_DIR, "meta/_journal.json"), "utf8"));
  for (const { tag } of journal.entries) {
    for (const statement of readFileSync(join(DRIZZLE_DIR, `${tag}.sql`), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await pg.exec(statement);
    }
  }
})();

// Každý typ vrátit jako surový text — parsování dělá ovladač Neonu sám.
const RAW = Object.fromEntries(Array.from({ length: 20000 }, (_, oid) => [oid, (value) => value]));

async function run({ query, params }) {
  const result = await pg.query(query, params ?? [], { rowMode: "array", parsers: RAW });
  return {
    fields: result.fields.map((field) => ({ name: field.name, dataTypeID: field.dataTypeID })),
    rows: result.rows,
    rowCount: result.affectedRows ?? result.rows.length,
    command: query.trim().split(/\s+/)[0].toUpperCase(),
  };
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!/^https:\/\/api\.[^/]*neon\.tech\/sql$/.test(url)) {
    return realFetch(input, init);
  }
  await ready;
  const body = JSON.parse(init.body);
  try {
    let payload;
    if (Array.isArray(body.queries)) {
      await pg.exec("BEGIN");
      try {
        const results = [];
        for (const q of body.queries) results.push(await run(q));
        await pg.exec("COMMIT");
        payload = { results };
      } catch (error) {
        await pg.exec("ROLLBACK");
        throw error;
      }
    } else {
      payload = await run(body);
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ message: error.message, code: error.code }), { status: 400 });
  }
};

// Volitelně (jen testy): E2E_SQL_PORT=4999 → na 127.0.0.1 poslouchá malý
// server, který spustí SELECT z těla požadavku v transakci jen pro čtení
// a vrátí řádky jako JSON — aby šlo z testu ověřit, co aplikace uložila.
if (process.env.E2E_SQL_PORT) {
  createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      await ready;
      await pg.exec("BEGIN READ ONLY");
      const result = await pg.query(body);
      await pg.exec("ROLLBACK");
      res.end(JSON.stringify(result.rows));
    } catch (error) {
      await pg.exec("ROLLBACK").catch(() => {});
      res.statusCode = 400;
      res.end(JSON.stringify({ error: error.message }));
    }
  })
    .on("error", (error) => console.error("E2E_SQL_PORT:", error.message))
    .listen(Number(process.env.E2E_SQL_PORT), "127.0.0.1");
}

