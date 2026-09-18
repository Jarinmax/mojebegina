# Production Go-Live Checklist — Moje Begina

Sepsáno ve Fázi 2.5. Tohle je plán pro budoucí, samostatně schvalovanou
fázi ostrého nasazení (2.6+) — nic z tohoto dokumentu není v Fázi 2.5
provedeno. Dokud tenhle checklist není celý splněný, appka na `main`
zůstává na starém mock milníku a Preview zůstává jediné místo, kde běží
reálná data.

## 1. Merge strategie Preview → main

- [ ] `main` je dnes na commitu `3acee02` (pre-Phase-2 mock milník) — merge
      `claude/affectionate-fermi-z3ice0` do `main` je skutečný, netriviální
      skok (nová DB vrstva, Neon Auth, autorizace), ne kosmetická změna.
- [ ] Merge až po explicitním schválení uživatele, ne automaticky po zelené
      Preview větvi.
- [ ] Po mergi zkontrolovat, že se automaticky nespustí produkční deployment
      dřív, než jsou nastavené produkční env proměnné (viz bod 2) — jinak
      build spadne na chybějící `DATABASE_URL`/`NEON_AUTH_*`.

## 2. Produkční Neon / Neon Auth env proměnné

- [ ] `DATABASE_URL` — produkční Neon Postgres connection string (ne ten
      samý, který používá Preview, pokud Preview a Production mají mít
      oddělená data).
- [ ] `NEON_AUTH_BASE_URL` — musí ukazovat na finální produkční doménu
      (`https://moje.begina.cz`), ne na `*.vercel.app`.
- [ ] `NEON_AUTH_COOKIE_SECRET` — vlastní, produkční hodnota (viz bod 3),
      nikdy sdílená s Preview.
- [ ] Ověřit ve Vercel Project Settings → Environment Variables, že tyhle
      proměnné jsou nastavené konkrétně pro **Production** prostředí, ne
      jen pro Preview/Development.

## 3. Silný produkční cookie secret

- [ ] Vygenerovat nový secret nezávisle na Preview: `openssl rand -base64 32`
      (přesně tenhle příkaz doporučuje i chybová hláška uvnitř
      `@neondatabase/auth`, pokud je secret příliš krátký).
- [ ] Uložit jen do Vercel Environment Variables pro Production, nikam do
      repozitáře.
- [ ] Bezpečnostní kontrola cookies samotných (httpOnly/secure/sameSite) už
      proběhla ve Fázi 2.5 — nainstalovaná verze `@neondatabase/auth`
      (`0.5.0-beta`) má tyhle atributy hardcoded/bezpečně defaultované na
      úrovni knihovny (viz report Fáze 2.5), takže tady není co dalšího
      nastavovat.

## 4. Produkční DB / migrace

- [ ] Rozhodnout: sdílí Production stejnou Neon databázi jako Preview, nebo
      má vlastní? (Dopad na to, jestli se Veroniččina reálná data z Preview
      musí "přenést", nebo jestli tam prostě zůstávají a Preview přestává
      být jejím jediným domovem.)
- [ ] Spustit `drizzle-kit generate` + aplikovat migrace na produkční DB
      stejným ručním postupem přes Neon Console SQL Editor jako dosud na
      Preview (žádný automatický migration step v CI zatím neexistuje).
- [ ] Pokud jde o novou/oddělenou produkční DB: přenést jen ověřená reálná
      data The Cup + Veroniččino `organization_memberships` — stejná
      pravidla jako ve Fázi 2.3 ("nic nevymýšlet", nullable místo
      vymyšlených hodnot).
- [ ] `QA Test Org` se do produkční DB nepřenáší vůbec (byla to jen
      testovací organizace pro Preview, viz Fáze 2.5).

## 5. Vercel Deployment Protection — Production vs. Preview

- [ ] Ověřit přesné nastavení: Preview má zůstat za Vercel Authentication
      (jak je dnes), ale Production **nesmí** vyžadovat Vercel účet —
      Veronika žádný nemá a nemá ho mít.
- [ ] Zkontrolovat ve Vercel Project Settings → Deployment Protection, že
      se ochrana dá nastavit odděleně pro Production/Preview/Branch
      deployments, a nastavit ji tak explicitně (ne spoléhat na default).

## 6. DNS / custom doména moje.begina.cz

- [ ] Ověřit, že `moje.begina.cz` je připojená k tomuhle Vercel projektu
      jako produkční doména (dřívější screenshoty ukazují, že doména už je
      v projektu registrovaná — potřeba jen potvrdit, že směřuje na
      Production, ne na starý statický web).
- [ ] Po mergi ověřit platný TLS certifikát a že `NEON_AUTH_BASE_URL`
      odpovídá přesně této doméně (jinak cookie/redirect flow nebude
      fungovat).

## 7. Smoke test: login → autorizace → data → logout

Po nasazení na produkci zopakovat na `moje.begina.cz` (ne na Preview) ve
stejném duchu jako testy Fáze 2.3/2.4:

- [ ] Nepřihlášený přístup na `/` → redirect na `/login`, žádná data.
- [ ] Veronika se přihlásí → redirect na `/` se skutečnými daty The Cup.
- [ ] `/objednavky`, `/profil`, `/partnersky-program` zobrazují správná
      data, vizuál odpovídá Preview.
- [ ] Logout z `/profil` → redirect na `/login`, žádná zbytková data.
- [ ] Rychlá kontrola response headers (Fáze 2.5) i na produkční doméně —
      HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
      Cache-Control: private, no-store na zákaznických stránkách.

## 8. Rollback postup

- [ ] Než se mergne do `main`, mít jasno, jak rychle vrátit produkci zpět:
      Vercel "Instant Rollback" na předchozí produkční deployment (viditelné
      v Deployments — stejné tlačítko, které bylo vidět při diagnostice ve
      Fázi 2.4).
- [ ] Rollback vrátí jen kód/deployment, ne DB — pokud go-live zahrnoval i
      migrace/data, promyslet předem, jestli je rollback kódu bez rollbacku
      dat bezpečný (typicky ano, pokud jsou migrace jen přídavné, ne
      destruktivní).
- [ ] Po případném rollbacku ověřit smoke test (bod 7) znovu.

## 9. Reset hesla (zatím NEimplementováno)

Označeno jako **důležitá následující funkce**, ne blocker pro úplně první
účet, ale nutná dřív, než bude zákazníků víc než jeden a nebudeme jim moct
osobně měnit hesla ručně.

- `@neondatabase/auth` metodu `resetPasswordForEmail` nabízí, ale vyžaduje
  napojení na e-mailového poskytovatele (SMTP/Resend/…), který v projektu
  zatím vůbec není nakonfigurovaný — to je samostatná integrace, ne
  drobnost.

## 10. Proces prvotního hesla — zdokumentováno, ne vyřešeno

**Současný stav (Fáze 2.3, použito pro Veroniku):** heslo prvnímu
zákazníkovi nastavuje Jarinmax ručně přes `/login` formulář a předává ho
zákazníkovi mimo appku (ne kódem řešeno).

**Proč tohle není cílový stav:** appka by dlouhodobě neměla stavět na tom,
že provozovatel zná/nastavuje trvalá hesla zákazníků. To je jak
bezpečnostní, tak provozní riziko (neškáluje se, zákazník nemá vlastní
kontrolu nad přihlašovacími údaji od prvního okamžiku).

**Cílový stav pro budoucí fázi:** buď (a) pozvánkový e-mail s aktivačním
odkazem, kterým si zákazník sám nastaví heslo napoprvé, nebo (b) obdoba
"zapomenuté heslo" flow použitá i pro prvotní aktivaci. Obojí předpokládá
vyřešený bod 9 (e-mailový poskytovatel), takže tyhle dvě položky přirozeně
patří do stejné budoucí fáze.
