# Platba kartou — test ve Stripe sandboxu na Preview

Cíl: před veřejným spuštěním ověřit, že platba kartou funguje celá
(pokladna → Stripe → webhook → MojeBegina) a že nevzniknou duplicitní
platby ani objednávky. **Jen testovací režim, žádné skutečné peníze,
Production beze změny.**

| | |
|---|---|
| Git větev | `claude/great-bell-ffjwo3-stripe` (z `main` po PR #20) |
| Preview | `https://mojebegina-git-claude-great-bell-ffjwo3-stripe-jarin-max.vercel.app` |
| Pokladna | `…/eshop/pokladna` |
| Webhook | `…/api/eshop/stripe/webhook?x-vercel-protection-bypass=<token>` |
| Databáze | Neon větev `preview/claude/great-bell-ffjwo3-stripe` (kopie Production při prvním nasazení; číslování = VS, hmotnosti) |
| Stripe | účet begina.cz (`acct_1UKfwF6S7EZO051t`), **Sandbox** |

## Nastavení (provádí majitel, klíče nikdy do chatu)

1. **Vercel → Settings → Deployment Protection → Protection Bypass for
   Automation:** token pro automatizaci (už existuje z dřívějšího testu,
   nebo vytvořit). Platí pro celý projekt, ale jen pro požadavky, které ho
   znají; přihlášení do Vercelu pro lidi zůstává. Administrace MojeBegina
   je navíc za vlastním přihlášením aplikace. Po testu token **vygenerovat
   znovu** → stará adresa webhooku přestane fungovat.
2. **Stripe Sandbox → Developers → Webhooks → Add destination:** adresa
   výše s tokenem; události `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`.
   Zkopírovat jeho **Signing secret** (`whsec_…`).
3. **Vercel → Settings → Environment Variables** — dvě proměnné, prostředí
   **jen Preview**, větev **`claude/great-bell-ffjwo3-stripe`**:
   `STRIPE_SECRET_KEY` = `sk_test_…` (Sandbox → Developers → API keys),
   `STRIPE_WEBHOOK_SECRET` = `whsec_…` z bodu 2.
4. Nové nasazení větve (push nebo Redeploy jejího nasazení).

Pojistky v kódu: mimo Production se použije **jen testovací klíč**
(`sk_test_`/`rk_test_`); Production bez `ESHOP_STRIPE_LIVE=on` kartu
nenabídne a webhook vrací 404; webhook bez platného podpisu nic nezpracuje.

## Scénáře (testovací karty Stripe; platnost libovolné budoucí datum, CVC libovolné)

| # | Scénář | Postup | Očekávání |
|---|---|---|---|
| 1 | Úspěšná platba | karta `4242 4242 4242 4242` | stránka objednávky „zaplaceno“; v MojeBegina Zaplaceno; 1 platba `succeeded`; číslo = VS (7xxxxxxx) |
| 2 | 3D Secure | `4000 0027 6000 3184` → v okně ověření „Complete“ | jako 1 |
| 3 | 3D Secure odmítnuto | `4000 0027 6000 3184` → „Fail“ | Stripe platbu nepřijme, objednávka nezaplacená, lze zkusit znovu |
| 4 | Zamítnutá karta | `4000 0000 0000 0002` | Stripe ukáže zamítnutí; objednávka nezaplacená |
| 5 | Zrušení platby | na stránce Stripe šipka zpět | návrat na objednávku „platba zrušena“, nezaplaceno, tlačítko Zaplatit znovu |
| 6 | Opakovaný pokus | u objednávky z 4/5 „Zaplatit znovu“ + `4242…` | stejná objednávka a stejné číslo/VS, Zaplaceno, žádná druhá objednávka |
| 7 | Dvojklik | v pokladně dvakrát rychle „Objednat“; na stránce objednávky dvakrát „Zaplatit“ | jedna objednávka, jedna platební stránka |
| 8 | Duplicitní webhook | Stripe → Workbench/Events → událost z 1 → **Resend** (2×) | odpověď `already-paid`; žádná druhá platba, žádný druhý e-mail |
| 9 | Převod beze změny | objednávka s „Bankovní převod“ | QR a VS jako dosud, číslo = VS |

Vypršení platební stránky (24 h) a druhou platbu jinou kartou pokrývají
automatické testy (`stripe.test.ts`, `stripeVsNumbering.test.ts`).

## Kontrola v databázi (Claude, jen čtení, po každém scénáři)

```sql
SELECT o.order_number, o.payment_vs, o.payment_status, o.total_kc,
       (SELECT count(*) FROM payments p WHERE p.order_id = o.id AND p.status = 'succeeded') AS uspesne,
       (SELECT string_agg(p.status, ',' ORDER BY p.created_at) FROM payments p WHERE p.order_id = o.id) AS pokusy,
       (SELECT count(*) FROM order_activity a WHERE a.order_id = o.id AND a.kind = 'payment_status_changed') AS zmen_stavu,
       (SELECT balance_state FROM order_payment_balance b WHERE b.order_id = o.id) AS bilance
FROM orders o WHERE o.channel = 'eshop' ORDER BY o.created_at DESC;
```

Očekáváno: `order_number = payment_vs`; zaplacená objednávka má právě
**1** úspěšnou platbu, **1** změnu stavu a bilanci `paid`; žádné číslo
ani VS dvakrát; Production `main` beze změny.

## Po testu

- Vygenerovat znovu Protection Bypass token (stará adresa webhooku zneplatní).
- Webhook v sandboxu lze smazat; testovací data zůstanou jen v Preview DB.
- Ostrý provoz až po schválení účtu Stripe (stav Enabled) — samostatný postup.
