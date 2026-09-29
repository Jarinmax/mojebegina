# ESHOP 1.0 — platba kartou přes Stripe (testovací režim, jen Preview)

Stav (28. 9. 2026): implementováno na větvi `claude/great-bell-ffjwo3`.
**Žádná migrace.** Produkce beze změny: v Production je platba kartou
vypnutá (viz pojistky).

## Jak to funguje

1. Zákazník v pokladně zvolí „Kartou online“ → objednávka se uloží jako
   **nezaplacená** (stejně jako u převodu) → přesměrování na platební
   stránku Stripe (Stripe Checkout; údaje karty nejdou přes náš server).
2. Spojení platby s objednávkou: `client_reference_id` = id objednávky,
   `metadata.orderId` + `metadata.source = mojebegina-eshop` (i na
   PaymentIntentu). Platby WooCommerce na stejném Stripe účtu se podle
   `source` ignorují.
3. Po zaplacení Stripe pošle událost na webhook. Server **ověří podpis**
   (`STRIPE_WEBHOOK_SECRET`), zkontroluje měnu a částku a jediným SQL
   příkazem přepne objednávku na **Zaplaceno** (`paid_at`) + zapíše do
   historie „Stripe nastavil(a) stav platby na Zaplaceno“ (id platby
   v `metadata`). Opakovaná/souběžná událost nic nezmění (idempotentní).
4. Zákazník se vrátí na `/eshop/objednavka/<id>` (bez osobních údajů):
   „Zaplaceno“, nebo „Čekáme na potvrzení“ (webhook ještě nedorazil),
   nebo „Platba nebyla dokončena“ + **Zaplatit znovu**.
5. Zrušená / propadlá platba: objednávka zůstává nezaplacená, jde zaplatit
   znovu. Opakované kliknutí použije ještě otevřenou platební stránku
   (idempotency key), nic nového nevznikne.
6. Varování v historii objednávky (pro vedení): druhá platba k už
   zaplacené objednávce (→ vrátit ve Stripe), platba s nesedící částkou
   (→ objednávka se NEoznačí jako zaplacená).

**Proč bez migrace:** id platby a platební stránky jsou v `order_activity.metadata`
(dohledatelné pro vrácení peněz). Nový sloupec v `orders` by stejně jako
u 0017 shodil Objednávky v Preview, dokud by se migrace nespustila —
přidat ho půjde později (reporty), když bude potřeba.

## Pojistky (Production guard) — `lib/eshop/stripe/config.ts`

- Karta je dostupná, jen když pokladna ukládá objednávky, oba klíče jsou
  nastavené a podpisový klíč začíná `whsec_`.
- Mimo Production **jen testovací klíč** (`sk_test_`/`rk_test_`) — ostrý
  klíč v Preview se nepoužije.
- V Production nic, dokud se výslovně nenastaví `ESHOP_ORDER_WRITE=on`
  **a** `ESHOP_STRIPE_LIVE=on` (den přepnutí z WooCommerce). Webhook pak
  vrací 404, volba „Kartou online“ je neaktivní (ověřeno v prohlížeči).

## 0. Účet: NOVÝ samostatný Stripe účet

Dnešní begina.cz platí přes **WooPayments** — ten je sice postavený na
Stripe, ale účet spravuje WooCommerce a vlastní API klíče pro jiný systém
nedává. Proto: dashboard.stripe.com → **Create a new Stripe account**
(název „Begina“, země Česká republika). Testovací režim funguje hned bez
ověření firmy; pro ostré platby Stripe později ověří podnikatele (IČO,
totožnost, bankovní účet, web, popis činnosti vč. alkoholických nápojů).
WooPayments zůstává beze změny až do dne přepnutí.

## 1. Stripe (testovací režim)

Přihlásit se na https://dashboard.stripe.com a **zapnout testovací režim**
(přepínač „Test mode“ / „Sandbox“ vpravo nahoře — vše níže musí být
v testovacím režimu).

**`STRIPE_SECRET_KEY`:** Developers → **API keys** → Secret key
(`sk_test_…`) → Reveal → zkopírovat.
Doporučeno místo toho omezený klíč: API keys → **Create restricted key** →
název „MojeBegina Preview“ → oprávnění **Checkout Sessions: Write**
(ostatní None) → Create → `rk_test_…`.

**Webhook a `STRIPE_WEBHOOK_SECRET`:** Developers → **Webhooks** → **Add
endpoint** (v novějším rozhraní „Add destination“ → Webhook endpoint):
- URL (bez ochrany Preview):
  `https://mojebegina-git-claude-great-bell-ffjwo3-jarin-max.vercel.app/api/eshop/stripe/webhook`
- URL, pokud je Preview za Vercel Authentication (viz 3):
  `https://mojebegina-git-claude-great-bell-ffjwo3-jarin-max.vercel.app/api/eshop/stripe/webhook?x-vercel-protection-bypass=<BYPASS_SECRET>`
- Události: `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`
- Uložit → v detailu endpointu **Signing secret** → Reveal → `whsec_…`.

WooPayments / WooCommerce se nemění (je to jiný účet).

## 2. Vercel — klíče jen pro Preview

Vercel → projekt **mojebegina** → Settings → **Environment Variables** →
Add:
- `STRIPE_SECRET_KEY` = `sk_test_…` (nebo `rk_test_…`)
- `STRIPE_WEBHOOK_SECRET` = `whsec_…`
- u obou zaškrtnout **jen Preview** (Production a Development NE);
  volitelně zúžit na větev `claude/great-bell-ffjwo3`.
- Uložit a **znovu nasadit** Preview (Deployments → poslední nasazení
  větve → ⋯ → Redeploy) — proměnné platí až pro nové nasazení.

Do Production nic nepřidávat.

## 3. Ochrana Preview (Protection Bypass) — jen pokud je Preview zamčené

Ověření: otevřít Preview adresu v anonymním okně. Chce-li přihlášení do
Vercelu, Stripe se na webhook nedostane (dostal by 401).

Vercel → Settings → **Deployment Protection** → **Protection Bypass for
Automation** → Add / Generate secret → zkopírovat → použít jako
`<BYPASS_SECRET>` v URL webhooku ve Stripe (bod 1). Ochrana Preview pro
lidi zůstává zapnutá.

## 4. První testovací platba

1. Ve Vercelu je nové nasazení větve Ready (po přidání proměnných).
2. `…/eshop` → do košíku např. Kulajdu → pokladna → **Kartou online**
   musí jít vybrat → vyplnit (vlastní e-mail, poznámka „TEST Stripe“) →
   Objednat.
3. Platební stránka Stripe (testovací) → karta **4242 4242 4242 4242**,
   libovolné budoucí datum, libovolné CVC → Zaplatit.
4. Návrat na stránku objednávky: „Zaplaceno — děkujeme“ (případně „Čekáme
   na potvrzení“ → Obnovit stav).
5. MojeBegina → Objednávky → detail: štítek Zaplaceno, v historii „E-shop
   přesměroval(a) zákazníka na platbu kartou (Stripe)“ a „Stripe
   nastavil(a) stav platby na Zaplaceno“.
6. Stripe (test) → Payments: platba 379 Kč; Webhooks → endpoint → poslední
   událost s odpovědí **200**.
7. Zrušení: nová objednávka kartou → na stránce Stripe „←“ zpět →
   „Platba nebyla dokončena“ → **Zaplatit znovu** → zaplatit → Zaplaceno.

## Ověřeno (bez Stripe účtu — api.stripe.com je z vývojového prostředí blokované)

- 331/331 testů (+20): pojistky (Preview/Production/ostrý klíč/chybějící
  klíče), parametry platby (haléře, doprava, spojení s objednávkou,
  návratové adresy, fallback na jednu položku), a nad DB (neon-http →
  PGlite) se **skutečným route handlerem a ověřením podpisu knihovnou
  Stripe**: úspěšná platba, zrušení/propadnutí + zaplatit znovu, opakované
  a souběžné kliknutí, opakovaný webhook, druhá platba, nesedící částka,
  cizí (WooCommerce) událost, chybný/chybějící podpis (400), Production
  (404).
- Prohlížeč: pokladna → „Kartou online“ → objednávka uložená jako
  nezaplacená; když Stripe neodpoví, zákazník dostane stránku objednávky
  se „Zaplatit znovu“ (chyba nalezená a opravená tímto testem); podepsaný
  webhook → „Zaplaceno“, druhý stejný webhook `already-paid`; v režimu
  Production karta neaktivní a webhook 404.
- **Neověřeno:** skutečné volání Stripe API a přesměrování na jejich
  platební stránku — ověří až první testovací platba v Preview.
