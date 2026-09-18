# Production Go-Live Checklist — Moje Begina

Sepsáno ve Fázi 2.5, revidováno ve Fázi 2.6 po ověření skutečné Neon/Vercel
konfigurace (branching, Neon Auth, routing). Tohle je plán pro budoucí,
samostatně schvalovanou fázi ostrého nasazení — nic z tohoto dokumentu
není zatím provedeno. Dokud tenhle checklist není celý splněný, appka na
`main` zůstává na starém mock milníku a Preview zůstává jediné místo, kde
běží reálná data.

## 0. Ověřená topologie (Fáze 2.6 průzkum)

Potvrzeno přímo v Neon Console a Vercel Environment Variables, ne
předpokladem:

- Neon projekt `mojeBegina-db` má dnes dvě větve: **`main`** (výchozí/
  produkční větev projektu, obsahuje ověřená data The Cup z Fáze 2.3) a
  **`preview/claude/affectionate-fermi-z3ice0`** — tu automaticky vytvořil
  Vercel ("Created by: Vercel", parent branch = `main`) jako dceřinou
  větev pro tenhle konkrétní git branch. Drží samostatný `neon_auth`
  obsah (Veroniččin Preview účet, testovací účet).
- **Rozhodnuto a potvrzeno uživatelem**: `main` = Production, Vercel/Neon
  preview branches = Preview. Žádný nový Neon projekt ani samostatná
  databáze se nezakládá.
- Vercel Environment Variables dnes: proměnné z integrace `mojeBegina-db`
  (`DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_PROJECT_ID`, `PG*`/
  `POSTGRES_*`) jsou nastavené na **"Production and Preview"** společně —
  tedy by už dnes měly mířit na `main`. Proti tomu ruční
  `NEON_AUTH_COOKIE_SECRET` a vlastní `NEON_AUTH_BASE_URL` z Fáze 2.1 jsou
  navázané **jen na branch `claude/affectionate-fermi-z3ice0`** a pro
  Production se vůbec neuplatní — **Production dnes nemá žádný cookie
  secret nastavený**, to je jediná chybějící věc z hlediska konfigurace.

## 1. Merge strategie Preview → main

- [ ] `main` je dnes na commitu `3acee02` (pre-Phase-2 mock milník) — merge
      `claude/affectionate-fermi-z3ice0` do `main` je skutečný, netriviální
      skok (nová DB vrstva, Neon Auth, autorizace), ne kosmetická změna.
- [ ] Merge až po explicitním schválení uživatele, ne automaticky po zelené
      Preview větvi.
- [ ] Merge provést až PO nastavení `NEON_AUTH_COOKIE_SECRET` pro Production
      (bod 3) — jinak první produkční build/request spadne na chybějící
      proměnnou (stejná chyba jako na začátku Fáze 2.0).

## 2. Produkční Neon / Neon Auth env proměnné

- [ ] `DATABASE_URL` — už existuje, spravovaná Neon integrací, scope
      "Production and Preview". **Ověřit** (ne předpokládat), že její
      hostname skutečně odpovídá větvi `main`, ne preview větvi.
- [ ] `NEON_AUTH_BASE_URL` — integrace poskytuje vlastní hodnotu se stejným
      scope. **Ověřit**, že po mergi skutečně odpovídá `https://moje.begina.cz`
      pro Production requesty (Better Auth toto pole používá jako
      referenční URL appky, ne jako adresu nějaké externí služby —
      potvrzeno v Fázi 2.6 čtením zdroje `authApiHandler`/
      `handleAuthProxyRequest`). Pokud integrace negeneruje per-doménu
      správnou hodnotu automaticky, nastavit ručně, Production-scoped.
- [ ] `NEON_AUTH_COOKIE_SECRET` — **chybí úplně**, musí se založit nově,
      výhradně pro Production (viz bod 3).

## 3. Silný produkční cookie secret

- [ ] Vygenerovat nový secret nezávisle na Preview: `openssl rand -base64 32`
      (přesně tenhle příkaz doporučuje i chybová hláška uvnitř
      `@neondatabase/auth`, pokud je secret příliš krátký).
- [ ] Uložit do Vercel Environment Variables, scope **Production** (ne
      "Production and Preview", ne branch-scoped jako dnešní Preview
      hodnota).
- [ ] Bezpečnostní kontrola cookies samotných (httpOnly/secure/sameSite) už
      proběhla ve Fázi 2.5 — nainstalovaná verze `@neondatabase/auth`
      (`0.5.0-beta`) má tyhle atributy hardcoded/bezpečně defaultované na
      úrovni knihovny, takže tady není co dalšího nastavovat.

## 4. Produkční DB / migrace

- [ ] **Žádná nová databáze ani migrace dat se nezakládá** — `main` už má
      schéma i ověřená data The Cup z Fáze 2.3. Jen zkontrolovat, že
      schéma na `main` odpovídá aktuálnímu `lib/db/schema.ts` (mělo by,
      nic ho odtud nemělo posunout).
- [ ] `QA Test Org` byla ve Fázi 2.5 odstraněna — ověřit, že na `main` (ne
      jen na preview větvi) skutečně není.

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

## 7. Vytvoření Veroniččiny produkční identity (revidováno ve Fázi 2.6)

Ověřeno v Neon Console, ne předpokladem: **Neon Console "Create user"
nevytváří heslo** (formulář má jen e-mail a jméno) a **nikde v administraci
(ani u existujícího uživatele) není možnost heslo dodatečně nastavit** —
menu u uživatele nabízí jen "View Details", "Make admin", "Delete". Náš
`/login` podporuje jen e-mail+heslo (Magic Link je v Neon Auth vypnutý).
Administrátorsky založený účet bez hesla by se tedy nikdy nepřihlásil.

**Zjištění**: Neon Auth dnes (viz banner přímo v Neon Console: "Anyone on
the web can sign up for your app. Support for restricted signups is
coming soon.") nemá ŽÁDNÝ způsob, jak nastavit heslo mimo veřejný
`POST /api/auth/sign-up/email` endpoint. To je platformní limitace, ne
mezera v našem kódu.

**Postup**:
- [ ] `/login` UI zůstává beze změny — žádné tlačítko na registraci.
- [ ] Jarinmax provede **jeden přímý, vědomý POST požadavek** na
      `https://moje.begina.cz/api/auth/sign-up/email` (ne přes žádné UI,
      přesné tělo požadavku — e-mail `razitko-kavarna@seznam.cz`, jméno,
      heslo — dostane při realizaci téhle fáze) — okamžitě po prvním
      úspěšném produkčním nasazení, ideálně ještě než se sundá Vercel
      Authentication z Production (viz Checkpoint 6 v revidovaném plánu
      níž).
- [ ] Získané produkční `user_id` → vložit `organization_memberships`
      řádek k produkční The Cup organizaci (stejné SQL jako ve Fázi 2.3).
- [ ] Až poté (bod 8) veřejný sign-up na aplikační vrstvě zablokovat.

## 8. Blokování veřejného sign-up endpointu po onboardingu (nové ve Fázi 2.6)

**Ověřeno, ne naslepo implementováno.** Přečten skutečný zdroj nainstalované
`@neondatabase/auth@0.5.0-beta`:

- Endpoint pro registraci je v Better Auth definovaný přesně jako
  `POST /sign-up/email` (`node_modules/.../better-auth/dist/api/routes/sign-up.mjs`).
- Náš `app/api/auth/[...path]/route.ts` dostává segmenty cesty jako pole
  (`params.path`) a `authApiHandler()` je uvnitř spojuje přesně stejným
  způsobem (`path.join("/")`) předtím, než je pošle do
  `handleAuthProxyRequest()` (proxy na spravovanou Neon Auth instanci).
  Žádná jiná registrace (OAuth, magic link) není v projektu zapnutá —
  e-mail+heslo je jediná cesta, jak dnes vzniká nový účet.
- **Závěr: lze bezpečně blokovat přesně a jen `POST /sign-up/email`
  přímo v našem vlastním route handleru**, bez potřeby `proxy.ts`
  (Next.js 16 ekvivalent middlewaru) — stačí obalit `POST` export z
  `auth.handler()`, zkontrolovat `(await params).path.join("/")` a pro
  přesnou shodu `"sign-up/email"` vrátit `403` ještě před voláním
  skutečného handleru. Sign-in, sign-out, get-session ani žádný jiný
  Better Auth endpoint (včetně `admin/*`) tímhle nejsou dotčené — jedou
  přes stejný `handler`, jen s jinou hodnotou `path`.

Referenční implementace (k nasazení jako samostatný commit AŽ PO bodu 7,
ne dřív):

```ts
// app/api/auth/[...path]/route.ts
import { auth } from "@/lib/auth/server";

const handlers = auth.handler();

export const GET = handlers.GET;

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const path = (await context.params).path.join("/").toLowerCase();
  if (path === "sign-up/email") {
    return new Response(
      JSON.stringify({ error: "Registration is disabled." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return handlers.POST(request, context);
}
```

**Postup**:
- [ ] Nasadit tenhle guard jako samostatný commit/push do `main` až po
      úspěšném vytvoření a ověření Veroniččina přihlášení (bod 7 hotový).
- [ ] Ověřit: nový pokus o `POST /api/auth/sign-up/email` na
      `moje.begina.cz` vrací `403`, ne úspěšné založení účtu.
- [ ] Ověřit zároveň: Veronika se pořád přihlásí (sign-in), vidí data,
      odhlásí se — blokace sign-up nemá na tohle vliv (jiný endpoint).
- [ ] Zapsat do dokumentace, že tohle je aplikační obrana nad platformní
      mezerou — až Neon vydá "restricted signups", zvážit, jestli tenhle
      guard nahradit/doplnit jejich vlastním mechanismem.

## 9. Smoke test: login → autorizace → data → logout

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
- [ ] Ověřit blokaci sign-up (bod 8) a že se tím nic z výše uvedeného
      nerozbilo.

## 10. Rollback postup

- [ ] Než se mergne do `main`, mít jasno, jak rychle vrátit produkci zpět:
      Vercel "Instant Rollback" na předchozí produkční deployment (viditelné
      v Deployments — stejné tlačítko, které bylo vidět při diagnostice ve
      Fázi 2.4).
- [ ] Rollback vrátí jen kód/deployment, ne DB — na `main` větvi to
      znamená, že se vrátí ke starému mock kódu, zatímco reálná data
      The Cup a Veroniččina membership v DB zůstávají netknutá (nic
      nemaže, appka je jen dočasně nezobrazuje).
- [ ] Pokud selže konkrétně blokace sign-up (bod 8), stačí vrátit jen
      tenhle jeden commit (revert), ne celý go-live — sign-up zůstane
      dočasně otevřený, zbytek appky funguje dál.
- [ ] Po případném rollbacku ověřit smoke test (bod 9) znovu.

## 11. Reset hesla (zatím NEimplementováno)

Označeno jako **důležitá následující funkce**, ne blocker pro úplně první
účet, ale nutná dřív, než bude zákazníků víc než jeden a nebudeme jim moct
osobně měnit hesla ručně.

- `@neondatabase/auth` metodu `resetPasswordForEmail` nabízí, ale vyžaduje
  napojení na e-mailového poskytovatele (SMTP/Resend/…), který v projektu
  zatím vůbec není nakonfigurovaný — to je samostatná integrace, ne
  drobnost.

## 12. Proces prvotního hesla pro BUDOUCÍ zákazníky — zdokumentováno, ne vyřešeno

**Současný/plánovaný stav (viz bod 7):** heslo prvnímu zákazníkovi
nastavuje Jarinmax jedním přímým API požadavkem a předává ho zákazníkovi
mimo appku (ne kódem řešeno). Po nasazení bodu 8 tohle zůstává JEDINÝ
způsob, jak založit nový účet — což zároveň znamená, že založení
DALŠÍHO zákazníka (např. Jiřího Střelce) bude vyžadovat dočasné odblokování
sign-up endpointu (vrátit commit z bodu 8, založit účet, znovu nasadit
blokaci) — to je vědomý, zdokumentovaný kompromis, ne zapomenutá mezera.

**Proč tohle není cílový stav:** appka by dlouhodobě neměla stavět na tom,
že provozovatel zná/nastavuje trvalá hesla zákazníků, ani na ručním
odemykání/zamykání registrace pro každého nového zákazníka. To je jak
bezpečnostní, tak provozní riziko.

**Cílový stav pro budoucí fázi:** buď (a) pozvánkový e-mail s aktivačním
odkazem, kterým si zákazník sám nastaví heslo napoprvé, nebo (b) obdoba
"zapomenuté heslo" flow použitá i pro prvotní aktivaci, nebo (c) až Neon
Auth dodá "restricted signups", nahradit naší vlastní blokaci jejich
nativním mechanismem. (a) a (b) předpokládají vyřešený bod 11 (e-mailový
poskytovatel), takže tyhle položky přirozeně patří do stejné budoucí fáze.
