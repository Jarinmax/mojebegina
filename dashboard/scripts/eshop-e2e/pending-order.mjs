// ESHOP — návrat ze Stripe bez nové objednávky, v prohlížeči nad sestavenou
// aplikací. Stripe nahrazuje místní napodobenina (E2E_STRIPE_API, viz
// lib/eshop/stripe/client.ts), DB je testovací neon-http-pglite.mjs.
// Nic neodchází ven.
//
// Spuštění (po `next build`):
//   PORT=3104 DATABASE_URL=postgresql://u:p@ep-test.neon.tech/neondb \
//   E2E_ORDER_NUMBERING=vs E2E_SQL_PORT=4996 E2E_STRIPE_API=http://127.0.0.1:12111 \
//   STRIPE_SECRET_KEY=sk_test_e2e STRIPE_WEBHOOK_SECRET=whsec_e2e \
//   E2E_CATALOG_SQL=31_sirupy.sql,41_polevky.sql,51_caje.sql,61_zmrzliny.sql,71_ovocne_napoje.sql \
//   NODE_OPTIONS="--import ./scripts/eshop-e2e/neon-http-pglite.mjs" npx next start -p 3104 &
//   node scripts/eshop-e2e/pending-order.mjs 3104 [adresář pro snímky]
import http from "node:http";
import Stripe from "stripe";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const PORT = Number(process.argv[2] ?? 3104);
const SHOTS = process.argv[3] ?? null;
const SQL_PORT = Number(process.env.E2E_SQL_PORT ?? 4996);
const STRIPE_PORT = Number(new URL(process.env.E2E_STRIPE_API ?? "http://127.0.0.1:12111").port);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e";
const failures = [];
const passed = [];
const check = (name, ok, detail = "") => (ok ? passed : failures).push(`${name}${detail ? ` — ${detail}` : ""}`);

function query(text) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: SQL_PORT, method: "POST", path: "/" }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => (res.statusCode === 200 ? resolve(JSON.parse(data)) : reject(new Error(data))));
    });
    req.on("error", reject);
    req.end(text);
  });
}
const rows = query;

// --- napodobenina Stripe Checkout ------------------------------------------
const sessions = new Map();
const byIdempotencyKey = new Map();
let created = 0;
const RUN = Date.now().toString(36);
const stripeMock = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const url = new URL(req.url, `http://127.0.0.1:${STRIPE_PORT}`);
    const json = (status, value) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      const key = req.headers["idempotency-key"];
      if (key && byIdempotencyKey.has(key)) return json(200, sessions.get(byIdempotencyKey.get(key)));
      const params = new URLSearchParams(body);
      created += 1;
      const id = `cs_test_e2e_${RUN}_${created}`;
      const session = {
        id,
        object: "checkout.session",
        status: "open",
        url: `http://127.0.0.1:${STRIPE_PORT}/pay/${id}`,
        client_reference_id: params.get("client_reference_id"),
        cancel_url: params.get("cancel_url"),
        success_url: params.get("success_url"),
      };
      sessions.set(id, session);
      if (key) byIdempotencyKey.set(key, id);
      return json(200, session);
    }
    const retrieve = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)$/);
    if (req.method === "GET" && retrieve) {
      const session = sessions.get(retrieve[1]);
      return session ? json(200, session) : json(404, { error: { message: "No such session" } });
    }
    const pay = url.pathname.match(/^\/pay\/([^/]+)$/);
    if (req.method === "GET" && pay && sessions.has(pay[1])) {
      const session = sessions.get(pay[1]);
      // Aplikace dává absolutní adresu https://begina.cz/… — v testu běží na http a portu.
      const cancel = new URL(session.cancel_url);
      const cancelUrl = `http://begina.cz:${PORT}${cancel.pathname}${cancel.search}`;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(
        `<!doctype html><title>Napodobenina Stripe</title><h1 id="stripe">Platba ${session.id}</h1>` +
          `<a id="cancel" href="${cancelUrl}">Zpět</a>`
      );
    }
    json(404, { error: { message: "not found" } });
  });
});
await new Promise((resolve) => stripeMock.listen(STRIPE_PORT, "127.0.0.1", resolve));

const signer = new Stripe("sk_test_e2e");
async function webhook(session, eventId) {
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        object: "checkout.session",
        id: session.id,
        client_reference_id: session.client_reference_id,
        metadata: { orderId: session.client_reference_id, source: "mojebegina-eshop" },
        payment_status: "paid",
        currency: "czk",
        amount_total: session.amountHal,
        payment_intent: `pi_${session.id}`,
      },
    },
  });
  const header = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const response = await fetch(`http://localhost:${PORT}/api/eshop/stripe/webhook`, {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": header, "content-type": "application/json" },
  });
  return (await response.json()).outcome;
}

// --- prohlížeč -------------------------------------------------------------
const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP begina.cz 127.0.0.1`] });
const pub = (path) => `http://begina.cz:${PORT}${path}`;
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const notice = () => page.locator("[data-pending-order]");
const eshopOrders = async () => rows(`SELECT id, order_number::text AS n, payment_status AS st FROM orders WHERE channel = 'eshop' ORDER BY created_at`);

try {
  const before = (await eshopOrders()).length;

  await page.goto(pub("/"));
  await page.evaluate(() => localStorage.setItem("begina-eshop-cart-v2", JSON.stringify([{ sku: "kulajda", quantity: 1 }])));
  await page.goto(pub("/pokladna"));
  await page.waitForSelector('input[name="paymentMethodId"]');
  check("pokladna: karta předvybraná", await page.locator('input[name="paymentMethodId"][value="karta"]').isChecked());
  for (const [id, value] of [["#name", "Test Návrat"], ["#email", "jana@example.cz"], ["#phone", "+420 777 123 456"]]) await page.fill(id, value);
  await page.check('input[name="termsAccepted"]');
  await page.locator('button[type="submit"]').dblclick();
  await page.waitForURL(/\/pay\/cs_test_e2e_/);
  const firstPayUrl = page.url();

  const afterSubmit = await eshopOrders();
  const order = afterSubmit.at(-1);
  check("dvojklik na Objednat: jedna objednávka", afterSubmit.length === before + 1, `${afterSubmit.length - before}`);
  check("jedna platební stránka", created === 1, `${created}`);

  // Zpět ze Stripe
  await page.goBack();
  await notice().waitFor({ timeout: 15000 });
  const noticeText = await notice().innerText();
  check("Zpět: nabídka zaplatit tutéž objednávku s číslem", noticeText.includes(order.n), noticeText);
  check("Zpět: tlačítko „Zaplatit objednávku“", (await page.getByRole("button", { name: "Zaplatit objednávku" }).count()) === 1);
  const cartAfterBack = await page.evaluate(() => localStorage.getItem("begina-eshop-cart-v2"));
  check("Zpět: košík prázdný", cartAfterBack === "[]", String(cartAfterBack));
  await shot("1-zpet");

  // Obnovení stránky
  await page.reload();
  await notice().waitFor({ timeout: 15000 });
  check("obnovení pokladny: nabídka zůstává", (await notice().innerText()).includes(order.n));
  check("obnovení pokladny: nelze objednat znovu (prázdný košík)", (await page.getByText("V košíku nic není").count()) === 1);
  await page.goto(pub("/kosik"));
  await notice().waitFor({ timeout: 15000 });
  check("košík: nabídka zaplatit objednávku", (await notice().innerText()).includes(order.n));
  await shot("2-kosik");
  check("žádná nová objednávka po Zpět / obnovení", (await eshopOrders()).length === before + 1);

  // Zaplatit objednávku (dvojklik) → tatáž otevřená platební stránka
  await page.getByRole("button", { name: "Zaplatit objednávku" }).dblclick();
  await page.waitForURL(/\/pay\/cs_test_e2e_/);
  check("Zaplatit objednávku: tatáž platební stránka", page.url() === firstPayUrl && created === 1, `${page.url()} / ${created}`);

  // Zrušení na Stripe → stránka objednávky
  await page.click("#cancel");
  await page.waitForURL(/platba=zrusena/);
  check(
    "zrušení: stránka objednávky s „Zaplatit objednávku“",
    (await page.getByRole("button", { name: "Zaplatit objednávku" }).count()) === 1 && (await page.locator("main").innerText()).includes(order.n)
  );
  await shot("3-zruseno");

  // Zaplaceno (webhook), opakovaný webhook
  const [{ total }] = await rows(`SELECT total_kc AS total FROM orders WHERE id = '${order.id}'`);
  const session = { ...[...sessions.values()][0], amountHal: Number(total) * 100 };
  const first = await webhook(session, `evt_e2e_${RUN}`);
  check("webhook: zaplaceno", first === "paid", first);
  const again = await webhook(session, `evt_e2e_${RUN}`);
  check("opakovaný webhook: already-paid", again === "already-paid", again);
  await page.reload();
  check("stránka objednávky: Zaplaceno", (await page.locator("h1").innerText()).includes("Zaplaceno"));
  const pendingAfterPaid = await page.evaluate(() => localStorage.getItem("begina-eshop-pending-order-v1"));
  check("zaplaceno: rozpracovaná objednávka zapomenuta", pendingAfterPaid === null, String(pendingAfterPaid));
  await page.goto(pub("/kosik"));
  await page.waitForSelector("text=Košík je prázdný");
  await page.waitForTimeout(1500);
  check("košík po zaplacení: žádná nabídka platby", (await notice().count()) === 0);

  const [money] = await rows(`SELECT
      (SELECT count(*) FROM payments WHERE order_id = '${order.id}')::int AS plateb,
      (SELECT count(*) FROM payments WHERE order_id = '${order.id}' AND status = 'succeeded')::int AS uspesnych,
      (SELECT count(*) FROM order_activity WHERE order_id = '${order.id}' AND kind = 'payment_status_changed')::int AS zmen`);
  check("DB: 1 platba, 1 úspěšná, 1 změna stavu", money.plateb === 1 && money.uspesnych === 1 && money.zmen === 1, JSON.stringify(money));
  check("DB: celkem jediná nová objednávka", (await eshopOrders()).length === before + 1);

} catch (error) {
  failures.push(`výjimka: ${error.stack ?? error}`);
  await shot("chyba");
} finally {
  await browser.close();
  stripeMock.close();
}

console.log(`OK ${passed.length}`);
for (const line of passed) console.log(`  ✓ ${line}`);
if (failures.length) {
  console.log(`CHYBY ${failures.length}`);
  for (const line of failures) console.log(`  ✗ ${line}`);
  process.exit(1);
}
