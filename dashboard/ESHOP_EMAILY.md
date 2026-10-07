# ESHOP 1.0 — potvrzovací e-maily (Resend, jen Preview)

Stav (1. 10. 2026): implementováno na větvi `claude/great-bell-ffjwo3`.
**Žádná migrace** (odeslané e-maily se zapisují do `order_activity`).
Production neposílá nic, dokud se výslovně nenastaví `ESHOP_EMAIL_LIVE=on`.

## Audit (1. 10. 2026)

- V projektu dosud **žádný** e-mailový poskytovatel ani SMTP (bez knihovny,
  bez proměnných). Aktivační e-maily a reset hesla posílá **Neon Auth**
  vlastní službou — pro jiné e-maily nepoužitelné
  (`PRODUCTION_GO_LIVE_CHECKLIST.md` bod 11, `BACKLOG.md`).
- Zvoleno: **Resend** (REST API voláme přímo, bez další knihovny).

## Kdy co odchází — `lib/eshop/email/orderEmails.ts`

| Událost | Zákazník | Begina (interně) |
|---|---|---|
| převod — objednávka uložená | „Přijali jsme vaši objednávku“ (čeká na platbu převodem) | „Nová objednávka … — Čeká na platbu převodem“ |
| karta — objednávka uložená | nic (zákazník je na platební stránce) | nic |
| karta — Stripe potvrdil platbu (webhook) | **jedno** potvrzení „Objednávka … je zaplacená“ | „Nová objednávka … — Zaplaceno kartou“ |
| karta — zrušená / propadlá platba | nic (stránka objednávky nabízí „Zaplatit znovu“) | nic (v MojeBegina nezaplacená) |
| opakovaný / souběžný webhook | nic | nic |

Proč u karty první e-mail čeká na Stripe: zákazník dostane jedinou,
pravdivou zprávu (žádné „přijato, nezaplaceno“ a hned „zaplaceno“) a Begina
nedostává upozornění na opuštěné platby. „Zaplaceno“ se píše **jen** když
je v DB `payment_status = 'paid'` (u karty ho nastavuje ověřený webhook).

Obsah pro zákazníka: položky, doprava (adresa / místo odběru), celkem,
způsob a stav platby, reference objednávky (až bude číslování zapnuté,
číslo objednávky), odkaz na stránku stavu objednávky, u převodu platební
údaje a QR Platbu (`ESHOP_PREVOD_QR.md`, bez účtu „pošleme co nejdříve“). Interně: jméno,
částka, položky, doprava, stav platby, poznámka zákazníka, odkaz na detail
v MojeBegina; „Odpovědět“ jde rovnou zákazníkovi.

**Proti duplicitám:** e-maily se spouštějí jen při skutečném vzniku
objednávky (dvojí odeslání formuláře nic nepošle) a při skutečném přepnutí
na Zaplaceno; každá šablona jde k objednávce jen jednou (`email_sent`
v historii) a Resend dostane `Idempotency-Key`.

**Výpadek e-mailu:** posílá se až po uložení objednávky / platby a nikdy
nevyhazuje výjimku. Objednávka zůstane uložená (a zaplacená), webhook vrátí
200, do historie objednávky se zapíše „⚠ nepodařilo se odeslat e-mail“ —
pak je potřeba kontaktovat zákazníka ručně.

## Preview = testovací režim (nic neodejde skutečným zákazníkům)

- Mimo Production je **povinný** `ESHOP_EMAIL_TEST_RECIPIENTS`; bez něj se
  nic neposílá.
- E-mail dostanou **jen** adresy z tohoto seznamu. Adresa zákazníka, která
  na seznamu není, e-mail nedostane — místo ní ho dostanou testovací adresy
  s pruhem „TESTOVACÍ E-MAIL … V ostrém provozu by šel na: …“ a `[TEST]`
  v předmětu. Obsah je jinak skutečný.
- Kdo testuje na vlastní e-mail ze seznamu, dostane ho přímo.

## 1. Resend

1. Účet na https://resend.com (firemní e-mail).
2. **Domains → Add domain → `begina.cz`**, region **EU (Ireland)**.
   (Ověřuje se celá doména, aby šlo posílat z `objednavky@begina.cz`.)
3. Resend vypíše DNS záznamy → screenshot Claudovi ke kontrole → bod 2.
4. **API Keys → Create API key**: *Sending access*, doména `begina.cz`,
   název „MojeBegina Preview“ → `re_…` (do chatu neposílat).
5. Ještě před ověřením DNS lze testovat s odesílatelem
   `Begina <onboarding@resend.dev>` — Resend ale pak doručí **jen na e-mail
   vlastníka účtu** (ten dejte do `ESHOP_EMAIL_TEST_RECIPIENTS`).

## 2. DNS `begina.cz` (zakládá vedení u správce DNS, ne Claude)

Přesné hodnoty vždy z obrazovky Resendu. Obvykle:

| Typ | Název (host) | Hodnota |
|---|---|---|
| MX | `send` | `feedback-smtp.eu-west-1.amazonses.com` (priorita 10) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey` | DKIM klíč `p=…` z Resendu |
| TXT | `_dmarc` | `v=DMARC1; p=none;` — **jen pokud tam ještě žádný DMARC není** |

- Hlavní MX a SPF záznam `begina.cz` (dnešní pošta) se **nemění** — záznamy
  Resendu jsou na subdoméně `send` a `resend._domainkey`.
- Existující `_dmarc` neměnit bez kontroly (přísná politika by mohla
  ovlivnit i dnešní poštu).
- Schránka / alias `objednavky@begina.cz` by měla existovat — zákazníci na
  potvrzení odpovídají. Jinak nastavit `ESHOP_EMAIL_REPLY_TO` na existující
  adresu.
- Ověření v Resendu trvá minuty až desítky hodin (Resend → Domains →
  Verified).

## 3. Vercel — proměnné jen pro Preview

| Proměnná | Příklad | Poznámka |
|---|---|---|
| `RESEND_API_KEY` | `re_…` | tajné |
| `ESHOP_EMAIL_FROM` | `Begina <objednavky@begina.cz>` | před ověřením DNS `Begina <onboarding@resend.dev>` |
| `ESHOP_EMAIL_INTERNAL_TO` | adresy Jaroslava a Lucie, oddělené čárkou | interní upozornění |
| `ESHOP_EMAIL_TEST_RECIPIENTS` | stejné adresy (+ další testeři) | povinné mimo Production |
| `ESHOP_EMAIL_REPLY_TO` | např. `info@begina.cz` | volitelné |
| `ESHOP_BANK_ACCOUNT`, `ESHOP_BANK_IBAN` | viz `ESHOP_PREVOD_QR.md` | platební údaje a QR u převodu |
| `ESHOP_EMAIL_LIVE` | — | **nenastavovat**; až v den spuštění, jen Production |

Settings → Environment Variables → u každé zaškrtnout **jen Preview** →
uložit → **Redeploy** posledního nasazení větve.

## 4. Test v Preview

1. `…/eshop` → košík → pokladna → **Bankovní převod** → vlastní jméno,
   libovolný e-mail (např. `jana@example.cz`) → Objednat. Na testovací
   adresy přijdou 2 e-maily ([TEST] potvrzení s pruhem „by šel na
   jana@example.cz“ + interní upozornění). V MojeBegina → detail objednávky
   → historie: „E-shop odeslal(a) e-mail …“ (2×).
2. Nová objednávka **Kartou online** → po přesměrování na Stripe nepřišlo
   nic → zaplatit 4242 4242 4242 4242 → přijde jedno potvrzení „je
   zaplacená“ + interní „Zaplaceno kartou“.
3. Stripe → Webhooks → událost → **Resend** (znovu poslat) → žádný další
   e-mail.

## Ověřeno (bez sítě — Resend i Stripe nahrazené napodobeninou)

- 38 nových testů (`email.test.ts`, `orderEmails.test.ts`): pojistky
  Preview/Production, testovací příjemci, obsah obou e-mailů (převod nikdy
  „zaplaceno“, karta až po webhooku), escapování textu zákazníka, volání
  Resend API (klíč, Idempotency-Key, chyby); nad DB skutečná pokladna
  i webhook s podpisem: běžná objednávka, převod, karta před / po
  zaplacení, opakovaný i souběžný webhook, dvojí odeslání formuláře,
  výpadek Resendu (pokladna i webhook), Preview bez seznamu, Production.
- **Neověřeno:** skutečné odeslání přes Resend a doručení do schránky —
  ověří první test v Preview po nastavení klíčů.
