# Řízení zaměstnanců, úkolů a aktivit — audit a návrh k odsouhlasení

Stav: **NÁVRH, NESCHVÁLENO.** Nic není implementováno. Žádná migrace, žádný zápis do Production DB,
žádný zásah do CRM (`leads`, `lead_activity`, `daily_call_queue`). Audit proběhl nad `main`
(commit `e91e00d`, 25. 10. 2026) a nad Production DB, ze které se jen četlo.

Cíl: z MojeBegina udělat univerzální systém úkolů a pracovní historie. Nejdřív ho bude
používat Jaroslav Blahout při vedení bistra a obchodu, později všichni zaměstnanci Begina.cz.
Schvaluje Jaroslav Viner.

---

## 1. Audit současného stavu

### 1.1 Co už existuje a dá se na tom stavět

| Oblast | Kde | Stav | Využití pro nový systém |
|---|---|---|---|
| Identita, přihlášení | Neon Auth, `lib/data/authContext.ts` | produkce | beze změny |
| Platformní role | `user_roles` (CUSTOMER/EMPLOYEE/EXECUTIVE/ADMIN), víc rolí na účet, `vyber-roli` | produkce | EMPLOYEE se konečně „probudí“ (viz 1.2) |
| Profily lidí | `user_profiles` (jméno, e-mail) | produkce | zdroj jmen, rozšíří se o pracovní profil |
| Izolované autorizační brány | `crmAuth.ts`, `companyNodeAuth.ts`, `dailyCallsAuth.ts` (allowlist podle userId **a** role) | produkce | stejný vzor pro novou `taskAuth.ts` |
| Živá mapa firmy | `company_nodes` + `company_node_activity` (stav, priorita, vlastník, propagace stavu) | produkce | strategická úroveň; úkol se k uzlu může jen **odkazovat** |
| CEO fokus | `focus_projects` + `focus_project_activity` („Kdo je na tahu“) | produkce | zůstává; zobrazí se v osobním přehledu |
| CRM 1.0 | `leads` (vlastník, fáze, příští kontakt), `lead_activity` (`created`, `call_logged`, `converted`…) | produkce, 221 leadů, 54 zapsaných hovorů | jen čtení; časová osa a výsledky obchodu |
| Denní volání | `daily_call_queue` (kurátor Viner → pracovník Blahout, auditní dvojice `*_at`/`*_by` vynucené CHECKy) | produkce | vzor pro stavy úkolů; na pracovní obrazovce bude karta „Dnešní volání“ |
| Objednávky | `orders` (`responsible_user_id`), `order_activity` s `actor_type` user/system/customer | produkce | systémově ověřené události do časové osy |
| Aktivity organizací | `organization_activity` | produkce | časová osa |
| Oznámení | tabulka `notifications` (user, type, title, body, href, read_at) | **existuje, ale nikdo do ní nezapisuje**; `/upozorneni` běží na mock datech | znovu se použije jako jádro in-app upozornění |
| E-maily | `lib/eshop/email/resend.ts` (Resend) | produkce | záložní kanál / denní souhrn pro vedoucího |
| GPT/MCP agent | `agent_grants`, `agent_tokens`, `agent_audit_log`, nástroje `my_overview`, `list_company_tasks`… | pilot v produkci | později nástroje „moje úkoly“ (jen čtení) |
| Pražský čas | `lib/agent/mcp/envelope.ts`, `lib/idoklad-read/time.ts` (+ `pragueTime.ts` na nesloučené větvi) | ano | opakování úkolů a „dnes“ vždy v Europe/Prague |

Konvence, které návrh dodržuje: append-only `*_activity` tabulky se snapshotem `author_name`,
soft-delete místo mazání, CHECK constrainty na páry „čas + aktér“, čisté validační moduly
(`*Validation.ts`) testované bez DB a brány oprávnění v samostatných souborech.

### 1.2 Mezery

1. **Úkoly pro jednotlivce neexistují.** `company_nodes` jsou strategické oblasti firmy. Nemají termín,
   časové okno, opakování, důkaz ani schválení. MCP nástroj `list_company_tasks` přitom uzlům
   říká „úkoly“, a to bude matoucí (viz rizika).
2. **Role EMPLOYEE je prázdná.** Má stejná práva jako CUSTOMER a po přihlášení vede na
   zákaznický dashboard `/` (`roles.ts: defaultPathForRole`). V produkci ji dnes **nemá nikdo**.
   Vedení (ADMIN: Viner; EXECUTIVE: Blahout, Střelec, Königsbergová) má do `/rizeni-firmy`
   přístup celé, jen podle role.
3. **Chybí úložiště souborů.** Aplikace nemá žádný blob/S3 storage. Sloupec
   `invoice_provider_links.pdf_storage_key` obsahuje jen odkaz do iDokladu.
4. **Upozornění nefungují.** Tabulka existuje, ale chybí zvonek, push i plánovač (cron).
5. **Žádný sjednocený pohled „co dělal člověk X“.** Aktivity jsou rozptýlené v pěti
   `*_activity` tabulkách s různými sloupci autora.
6. **Neliší se ověřené a ručně zapsané události.** `order_activity` má `actor_type`, ale
   `lead_activity` ne. Hovor (`call_logged`) je vždy jen to, co obchodník sám zapsal.
7. **DB driver je `drizzle-orm/neon-http`**, takže nemá interaktivní transakce. Souběh
   (dva vedoucí schvalují najednou, dvojklik na „Hotovo“) se musí řešit podmíněným
   `UPDATE … WHERE status = …` a `db.batch`, stejně jako dnes v Denním volání.

### 1.3 Nesloučené větve, které se návrhu týkají

Žádná z nich není v Production DB: tabulky `organization_owner_history` ani tabulky
kalendáře tam nejsou.

| Větev | Co přináší | Dopad na návrh |
|---|---|---|
| `feature/jarda-volani-provize-2-provize-bonus` | **první skutečný zápis do `notifications`** (`notifyOrderOwnerPaidSafe`), `notificationsInbox.ts`, historie správců zákazníka, 3% provize | převzít, nepsat znovu; schéma `notifications` rozšiřovat jen jednou |
| `feature/daily-calls-1-1-worker-history` | historie pracovníka v Denním volání, `pragueTime.ts` | časová osa zaměstnance z toho čerpá |
| `feature/google-calendar-1-0` | napojení Google Kalendáře | později: úkoly s časem do kalendáře (mimo tento návrh) |

**Kolize čísel migrací:** tyto větve používají `0021`–`0023`, ale `main` už má `0021`–`0024`.
Před první migrací tohoto projektu je nutné rozhodnout, v jakém pořadí se větve sloučí
a přečíslují (viz Etapa 0).

---

## 2. Návrh uživatelského rozhraní

Principy: **mobil na prvním místě** (stejná šířka 380 px jako zákaznická část), palcem
dosažitelná tlačítka (min. 44 px), maximálně dva dotyky k nejčastější akci, žádné tabulky
na telefonu.

### 2.1 Pracovní obrazovka zaměstnance — `/prace`

Výchozí stránka po přihlášení pro roli EMPLOYEE. Vedení se k ní dostane odkazem
„Moje práce“, protože i Blahout dostává úkoly od Vinera.

```
┌──────────────────────────────┐
│ Dnes · pondělí 27. 10.   🔔3 │
│ 4 hotovo · 3 zbývá · 1 po t. │
├──────────────────────────────┤
│ ⚠ VRÁCENO K OPRAVĚ (1)       │  ← vždy nahoře, s komentářem vedoucího
│ ▌Úklid chlazení              │
│ ▌„Chybí fotka zadní police“  │
│ ▌        [ Opravit a odeslat]│
├──────────────────────────────┤
│ 🔴 PO TERMÍNU (1)            │
│ ▌Objednat obaly   do 10:00   │
├──────────────────────────────┤
│ ▶ PRÁVĚ TEĎ                  │  ← časové okno běží
│ ▌Kontrola teplot  9:00–9:30  │
│ ▌📷 povinná fotka  ⏱ 12 min  │  ← odpočet < 30 min = oranžová
│ ▌ [ Začít ]   [ 📷 Hotovo ]  │
├──────────────────────────────┤
│ POZDĚJI DNES                 │
│ ▌Otevření bistra 10:30–11:00 │
│ ▌Zavolat 5 leadů  do 16:00   │
│ 📞 Dnešní volání (6)  →      │  ← odkaz na existující modul
├──────────────────────────────┤
│ ČEKÁ NA KONTROLU (2)  ⌄      │  ← sbalené
└──────────────────────────────┘
 [Dnes] [Úkoly] [Volání] [Historie] [Já]
```

- **Barevný proužek vlevo** = priorita (nízká / střední / vysoká / kritická), stejná škála jako `company_nodes`.
- **Zvýraznění termínu:** méně než 30 min (nebo 10 % okna) = oranžová a odpočet; po termínu = červená sekce nahoře.
- **„Začít“** je volitelné, ale díky němu vedoucí vidí, co se právě řeší. Nic se nesleduje automaticky.
- **Hotovo s povinnou fotkou:** tlačítko otevře rovnou fotoaparát (`<input type="file" accept="image/*" capture="environment">`).
  Odeslat jde až po nahrání minimálního počtu fotek. Kontroluje to i **server**, nejen UI.
- **Odeslání:** volitelná poznámka, náhledy fotek, velké tlačítko „Odeslat ke kontrole“ nebo „Dokončit“.
  Druhý dotyk je idempotentní a nevytvoří duplikát.
- **Historie:** dokončené úkoly po dnech, ke každému fotky a výsledek kontroly.

### 2.2 Zadání úkolu (vedoucí) — `/rizeni-firmy/tym/ukoly/novy`

Jeden formulář, pokročilá pole jsou sbalená:

- Název, popis
- Odpovědný zaměstnanec (výběr z aktivních zaměstnanců)
- Začátek (datum a čas) a termín dokončení. Časové okno vznikne automaticky.
- Priorita
- Opakování: *jednorázově / denně / pracovní dny / vybrané dny v týdnu / měsíčně*, s volitelným koncem
- Důkaz: *žádný / fotka (min. počet) / příloha*
- Vyžaduje schválení vedoucím (ano/ne)
- Volitelná vazba: lead, zákazník, objednávka, uzel živé mapy
- **Šablony** („Otevření bistra“, „Kontrola teplot“, „Úklid chlazení“, „Uzávěrka pokladny“),
  aby se opakované úkoly nezadávaly pořád znovu

### 2.3 Kontrola — `/rizeni-firmy/tym/kontrola`

Fronta „Čeká na kontrolu“ seřazená od nejstaršího. Karta ukazuje úkol, kdo, kdy, poznámku
a fotky přes celou šířku (galerie se swipem). Akce:

- **Schválit** (jeden dotyk)
- **Vrátit k opravě**, kde je komentář povinný

Obojí zapíše aktivitu a upozorní zaměstnance.

### 2.4 Manažerský přehled (Jaroslav Viner) — `/rizeni-firmy/tym`

```
┌ Tým · dnes ─────────────────────────────────────────────┐
│ Hotovo 12 · Po termínu 2 · Ke kontrole 3 · Vráceno 1    │
├─────────────────────────────────────────────────────────┤
│ Jaroslav Blahout        ▶ Kontrola teplot (od 9:04)     │
│  dnes 4/7 · po termínu 1 · ke kontrole 1 · 📷📷📷        │
│  obchod: 6 hovorů · 2 posunuté leady · 1 objednávka ✔   │
├─────────────────────────────────────────────────────────┤
│ (další zaměstnanci…)                                    │
└─────────────────────────────────────────────────────────┘
 [Po termínu] [Ke kontrole] [Fotky dne] [Časová osa]
```

Pokrývá všech sedm požadavků:
1. co zaměstnanec právě řeší (stav „probíhá“),
2. co dnes dokončil,
3. co je po termínu,
4. co čeká na kontrolu,
5. jaké fotky odevzdal (fotky dne),
6. výsledky obchodu,
7. chronologickou historii.

### 2.5 Karta zaměstnance — `/rizeni-firmy/tym/[userId]` (a `/prace/ja` pro vlastní kartu)

Záložky:
- **Přehled:** dnešek, termíny na 7 dní, aktuální úkol
- **Úkoly:** přidělené, filtry podle stavu
- **Historie:** dokončené a schválené
- **Obchod:** leady ve vlastnictví, hovory, posuny fází, konverze a objednávky
- **Fotky a přílohy**
- **Výsledky:** den/týden — splněno včas %, po termínu, vráceno, hovory, konverze
- **Časová osa:** důležité akce a změny ze všech modulů

Každá položka časové osy má štítek důvěryhodnosti:

| Štítek | Význam | Příklady |
|---|---|---|
| **✔ Ověřeno systémem** | událost vznikla v systému, ne tvrzením člověka | objednávka zaplacená přes Stripe nebo převodem, faktura, konverze leadu na zákazníka s objednávkou, schválení vedoucím |
| **📷 Doloženo** | člověk akci zapsal a přiložil důkaz | úkol dokončený s fotkou |
| **✎ Zapsáno ručně** | jen záznam zaměstnance | zapsaný hovor, poznámka, ruční změna fáze leadu |

**Zaměstnanec vidí svou kartu celou**, včetně štítků a výsledků. Je to podmínka transparentnosti (viz kap. 7).

---

## 3. Návrh databázových změn

Všechny změny jsou **jen přidávající** (nové tabulky, nové nullable sloupce). Existující CRM
tabulky se **neupravují**, nové tabulky na ně jen odkazují cizím klíčem. Pořadové číslo
migrace se určí až po vyřešení kolize z 1.3.

### 3.1 Nové tabulky

```sql
-- Pracovní profil (oddělený od user_profiles, které jen zrcadlí Neon Auth)
CREATE TABLE staff_profiles (
  user_id          text PRIMARY KEY,                -- Neon Auth userId
  display_name     text NOT NULL,
  position         text,                            -- „Vedoucí bistra“, „Obchod“…
  team             text,                            -- 'bistro' | 'obchod' | 'vyroba' | 'kancelar'
  manager_user_id  text,                            -- přímý vedoucí (kdo zadává a schvaluje)
  is_active        boolean NOT NULL DEFAULT true,
  created_at, updated_at timestamptz NOT NULL DEFAULT now()
);

-- Předpis opakování (šablona), ze kterého se generují konkrétní úkoly
CREATE TABLE task_recurrences (
  id uuid PK, title, description, assignee_user_id text NOT NULL,
  created_by text NOT NULL, priority text NOT NULL,
  rule text NOT NULL,          -- 'daily' | 'weekdays' | 'weekly' | 'monthly'
  weekdays smallint[],         -- 1–7 pro 'weekly'
  month_day smallint,          -- pro 'monthly'
  window_start time NOT NULL, window_end time NOT NULL,   -- Europe/Prague
  proof_type text NOT NULL DEFAULT 'none',  -- 'none' | 'photo' | 'attachment'
  min_photos smallint NOT NULL DEFAULT 0,
  requires_approval boolean NOT NULL DEFAULT false,
  starts_on date NOT NULL, ends_on date,
  generated_until date,        -- kam až už plánovač vygeneroval
  paused_at timestamptz, created_at, updated_at
);

-- Konkrétní úkol (jednorázový nebo jeden výskyt opakovaného)
CREATE TABLE tasks (
  id uuid PK,
  title text NOT NULL, description text,
  assignee_user_id text NOT NULL,
  created_by text NOT NULL,
  reviewer_user_id text,                       -- kdo schvaluje (default = zadavatel)
  priority text NOT NULL DEFAULT 'medium',     -- 'low'|'medium'|'high'|'critical'
  starts_at timestamptz, due_at timestamptz NOT NULL,
  -- 'open' → 'in_progress' → ('submitted' → 'approved' | 'returned') | 'done'; kdykoli 'cancelled'
  status text NOT NULL DEFAULT 'open',
  proof_type text NOT NULL DEFAULT 'none', min_photos smallint NOT NULL DEFAULT 0,
  requires_approval boolean NOT NULL DEFAULT false,
  recurrence_id uuid REFERENCES task_recurrences(id), occurrence_date date,
  -- volitelné vazby, jen odkazy (žádná změna cílových tabulek)
  lead_id uuid REFERENCES leads(id),
  organization_id uuid REFERENCES organizations(id),
  order_id uuid REFERENCES orders(id),
  company_node_id uuid REFERENCES company_nodes(id),
  started_at timestamptz, started_by text,
  completed_at timestamptz, completed_by text,  -- odeslání / dokončení
  reviewed_at timestamptz, reviewed_by text,
  cancelled_at timestamptz, cancelled_by text,
  created_at, updated_at
);
-- CHECKy podle vzoru daily_call_queue: páry (x_at IS NULL) = (x_by IS NULL),
-- status ∈ množina, 'approved'/'returned' ⇒ reviewed_*, proof_type='photo' ⇒ min_photos ≥ 1.
-- UNIQUE (recurrence_id, occurrence_date) — plánovač je idempotentní.
-- INDEX (assignee_user_id, status, due_at), INDEX (reviewer_user_id, status).

-- Každé odevzdání je samostatný řádek → vrácení a opakované odeslání zůstává v historii
CREATE TABLE task_submissions (
  id uuid PK, task_id uuid NOT NULL REFERENCES tasks(id),
  submitted_by text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(),
  note text,
  review_status text NOT NULL DEFAULT 'pending',   -- 'pending'|'approved'|'returned'|'not_required'
  reviewed_by text, reviewed_at timestamptz, review_note text,
  idempotency_key text UNIQUE                      -- ochrana proti dvojkliku
);
-- CHECK: review_status='returned' ⇒ review_note IS NOT NULL (vrácení vždy s důvodem)

CREATE TABLE task_attachments (
  id uuid PK, task_id uuid NOT NULL REFERENCES tasks(id),
  submission_id uuid REFERENCES task_submissions(id),
  kind text NOT NULL,                 -- 'photo' | 'file'
  storage_key text NOT NULL UNIQUE,   -- klíč v privátním bucketu, nikdy veřejná URL
  mime_type text NOT NULL, size_bytes integer NOT NULL, sha256 text NOT NULL,
  width integer, height integer,
  captured_at timestamptz,            -- z EXIF, pokud je; jen informativně
  uploaded_by text NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz, deleted_by text   -- soft delete; fyzické smazání řeší retence
);

-- Stejný vzor jako ostatní *_activity
CREATE TABLE task_activity (
  id uuid PK, task_id uuid NOT NULL REFERENCES tasks(id),
  actor_type text NOT NULL DEFAULT 'user',      -- 'user' | 'system'
  author_user_id text, author_name text,
  kind text NOT NULL,  -- created|assigned|started|submitted|approved|returned|done|
                       -- cancelled|due_changed|priority_changed|overdue
  body text, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id uuid PK, user_id text NOT NULL,
  endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL,
  user_agent text, created_at, last_success_at, revoked_at timestamptz
);
```

### 3.2 Rozšíření existující tabulky `notifications`

Jen nové nullable sloupce, sladěné s větví provizí:

```sql
ALTER TABLE notifications
  ADD COLUMN entity_type text,          -- 'task' | 'order' | 'lead' …
  ADD COLUMN entity_id uuid,
  ADD COLUMN severity text NOT NULL DEFAULT 'info',   -- 'info' | 'warning' | 'urgent'
  ADD COLUMN dedupe_key text,           -- např. 'task_due_soon:<taskId>'
  ADD COLUMN push_sent_at timestamptz;
CREATE UNIQUE INDEX notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX notifications_user_unread ON notifications(user_id, created_at) WHERE read_at IS NULL;
```

### 3.3 Sjednocená časová osa — pohled `staff_timeline` (jen čtení)

SQL VIEW (`UNION ALL`) nad `task_activity`, `lead_activity`, `order_activity`,
`company_node_activity`, `focus_project_activity` a `organization_activity`. Sloupce:
`occurred_at, actor_user_id, source, entity_type, entity_id, kind, summary, evidence`.

`evidence` (`system` / `proof` / `manual`) se **odvodí v pohledu** z `kind`/`actor_type`.
CRM tabulky tedy zůstanou beze změny. Do osy jdou jen **významné** události: změny stavu,
přiřazení, odevzdání, schválení, hovory, konverze, objednávky. Nejdou tam zobrazení stránek
ani kliknutí.

### 3.4 Oprávnění — nový soubor `lib/data/taskAuth.ts`

| Predikát | Pravidlo |
|---|---|
| `canSeeOwnWork` | každý přihlášený se záznamem v `staff_profiles` (`is_active`) |
| `canManageTasksFor(target)` | ADMIN, nebo přímý vedoucí (`staff_profiles.manager_user_id = ctx.userId`) |
| `canReview(task)` | `reviewer_user_id`, zadavatel, nebo ADMIN; **nikdy assignee sám sobě** |
| `canViewEmployeeCard(target)` | sám sebe, přímý vedoucí, ADMIN. EXECUTIVE obecně **ne** (k rozhodnutí, viz 8) |
| `canViewAttachment(att)` | assignee úkolu, jeho vedoucí / reviewer, ADMIN |

Další úpravy:
- `defaultPathForRole("EMPLOYEE")` → `/prace`. Dnes roli nikdo nemá, takže změna nikoho neovlivní.
- Nová sekce `/prace` má vlastní layout pro kohokoli s aktivním `staff_profiles`.
  `/rizeni-firmy` a jeho brány zůstávají **beze změny**.
- Nová podsekce `/rizeni-firmy/tym` má navíc vlastní kontrolu `canManageTasksFor` (vzor: `obchod/dnes`).

### 3.5 Fotografie a přílohy

- **Úložiště:** privátní S3-kompatibilní bucket v EU. Doporučení je Cloudflare R2 (levné,
  bez poplatku za stahování, jurisdikce EU). Alternativou je Vercel Blob, pokud bude ověřený privátní režim.
- **Nahrání:** klient fotku zmenší (max. 2048 px, JPEG/WebP, ~0,3–0,6 MB), **odstraní GPS z EXIF**
  a server vydá podepsanou PUT URL (platnost 5 min, pevný `Content-Type`, limit 10 MB).
  Server pak ověří objekt (HEAD: velikost, typ) a teprve potom zapíše `task_attachments`.
- **Zobrazení:** jen přes `/api/prilohy/[id]`, která zkontroluje `canViewAttachment` a přesměruje
  na podepsanou GET URL s platností 5 min. **Žádné veřejné URL.**
- **Povinná fotka** se vynucuje v server action při odeslání: počet nesmazaných příloh
  aktuálního odevzdání ≥ `min_photos`, jinak chyba. UI je jen pohodlí.
- **Poctivé omezení:** web neumí stoprocentně zakázat nahrání starší fotky z galerie.
  Ukládáme `captured_at` z EXIF a čas nahrání a vedoucí uvidí upozornění „fotka pořízena
  před začátkem úkolu“.
- **Retence:** běžné provozní fotky 12 měsíců, pak automatické smazání (návrh, k rozhodnutí).

---

## 4. Systém upozornění

### 4.1 Kanály

1. **In-app (vždy):** zvonek s počtem nepřečtených v hlavičce `/prace` i `/rizeni-firmy`,
   seznam `/prace/upozorneni`. Jádrem je tabulka `notifications`.
2. **Web Push (Etapa 3):** PWA (manifest + service worker) a VAPID klíče jako env proměnné.
   Na Androidu funguje v Chromu rovnou. **Na iPhonu jen po „Přidat na plochu“** (iOS 16.4+),
   proto bude v aplikaci krátký návod.
3. **E-mail (volitelně):** jeden **denní souhrn** pro vedoucího v 7:00 (po termínu, ke kontrole)
   přes stávající Resend. Žádné e-maily ke každé události.

### 4.2 Události

| Událost | Komu | Kanál |
|---|---|---|
| Nový úkol přidělen (jednorázový) | assignee | in-app + push |
| Blíží se termín (30 min / 10 % okna) | assignee | in-app + push |
| Termín uplynul | assignee + vedoucí | in-app + push (vedoucímu souhrnně) |
| Úkol odevzdán ke kontrole | reviewer | in-app + push |
| Schváleno / vráceno k opravě | assignee | in-app + push |
| Opakované úkoly na dnešek | assignee | jedno ranní souhrnné oznámení, ne jedno za každý úkol |

### 4.3 Spolehlivost

- **„Blíží se termín“ se počítá i při každém načtení stránky,** takže zvýraznění funguje i bez cronu.
  Cron je potřeba jen pro push a pro generování opakovaných úkolů.
- **Plánovač:** endpoint `/api/cron/ukoly` chráněný tajným tokenem, spouštěný každých 5–15 min.
  - Vygeneruje výskyty opakovaných úkolů na 2 dny dopředu. Je idempotentní díky
    `UNIQUE(recurrence_id, occurrence_date)`.
  - Zapíše upozornění s `dedupe_key`, takže opakované spuštění nevytvoří duplikát.
  - Odešle push u záznamů s `push_sent_at IS NULL`. Mrtvé subscription (HTTP 404/410) označí `revoked_at`.
  - **Spouštěč:** Vercel Cron, pokud to plán dovolí (Hobby jen 1× denně). Jinak externí plánovač,
    např. GitHub Actions nebo budoucí n8n instance.
- **Tichý režim:** bez push mezi 21:00 a 6:00, pokud okno úkolu nespadá do této doby.
- Push je **best-effort**, zdrojem pravdy zůstává in-app seznam. Chyba push nikdy neblokuje zápis úkolu.

---

## 5. Etapy implementace

Každá etapa je samostatná větev a PR s testy (vitest + pglite jako dosud), nasazení nejdřív na Preview.
**Migrace do Production až po výslovném schválení**, stejně jako u e-shopu.

| Etapa | Obsah | Výsledek pro uživatele |
|---|---|---|
| **0 — Příprava** | rozhodnutí z kap. 8; plán sloučení větví z 1.3 a přečíslování migrací; účet pro úložiště; seznam prvních zaměstnanců | jasné zadání |
| **1 — Úkoly MVP** | `staff_profiles`, `tasks`, `task_submissions`, `task_activity`, `taskAuth.ts`; zadání úkolu; `/prace` (dnešek, začít, hotovo, odeslat); kontrola (schválit / vrátit); in-app zvonek | Viner zadává Blahoutovi úkoly a schvaluje je, vše v historii |
| **2 — Fotky a přílohy** | úložiště, nahrání z fotoaparátu, povinná fotka vynucená serverem, galerie v kontrole a na kartě | důkaz o splnění |
| **3 — Opakování a upozornění** | `task_recurrences`, šablony, cron, upozornění na termín, PWA + Web Push, ranní souhrn | bistro jede podle denních checklistů s připomínkami |
| **4 — Karta zaměstnance a přehled** | pohled `staff_timeline`, záložky karty, výsledky den/týden, `/rizeni-firmy/tym`, napojení CRM (jen čtení), štítky ověřeno / doloženo / ručně | manažerský přehled pro Vinera |
| **5 — Rozšíření na celý tým** | zakládání EMPLOYEE účtů z adminu, týmy a vedoucí, informační dokument pro zaměstnance, retence fotek, MCP nástroj „moje úkoly“ (jen čtení) | systém pro všechny zaměstnance Begina.cz |

---

## 6. Rizika a odhad náročnosti

### 6.1 Rizika

| Riziko | Dopad | Opatření |
|---|---|---|
| Kolize migrací a konflikty s nesloučenými větvemi (`schema.ts`, `dailyCalls.ts`, `leads.ts`, `_journal.json`) | rozbitý deploy | Etapa 0: nejdřív sloučit / přečíslovat; nový kód do CRM souborů nesahá |
| Záměna „úkol“ × uzel živé mapy (MCP `list_company_tasks`) | zmatek, AI agent čte špatná data | v UI jasné názvosloví („Úkoly“ vs. „Oblasti firmy“); MCP nástroje později přejmenovat |
| Probuzení role EMPLOYEE | nechtěný přístup | nová sekce s vlastní bránou; `/rizeni-firmy` beze změny; testy izolace jako `dailyCallsWorkerIsolation` |
| Únik fotek | GDPR, reputace | privátní bucket, krátké podepsané URL, kontrola práv u každého zobrazení, odstranění GPS, retence |
| Push na iOS jen jako PWA | upozornění nedorazí | in-app jako zdroj pravdy, návod k instalaci, ranní souhrn |
| Limity Vercel Cron | opožděné připomínky | zvýraznění termínu počítané při renderu; externí spouštěč |
| Souběh bez interaktivních transakcí (neon-http) | dvojí schválení, duplikáty | podmíněné `UPDATE … WHERE status=…`, `idempotency_key`, `db.batch` |
| Letní / zimní čas u opakování | úkol o hodinu vedle | vše v Europe/Prague přes sdílený helper, testy na přechody času |
| Únava z upozornění | lidé je ignorují | souhrny, deduplikace, tichý režim, jen události z tabulky 4.2 |
| Vnímání jako „šmírování“ | odpor zaměstnanců, právní riziko | kap. 7: měří se výsledky práce, ne lidé; zaměstnanec vidí vše o sobě |

### 6.2 Odhad (vývojové dny, jeden vývojář s Claude, včetně testů a Preview)

| Etapa | Odhad |
|---|---|
| 0 — Příprava | 1–2 dny (hlavně sloučení větví) |
| 1 — Úkoly MVP | 5–7 dní |
| 2 — Fotky a přílohy | 3–4 dny |
| 3 — Opakování a upozornění | 4–6 dní |
| 4 — Karta a manažerský přehled | 4–6 dní |
| 5 — Rozšíření na tým | 3–5 dní |
| **Celkem** | **cca 20–30 pracovních dní** |

Provozní náklady jsou zanedbatelné: R2 do 10 GB zdarma, Web Push zdarma, Resend v rámci stávajícího plánu.

---

## 7. Ochrana osobních údajů a přiměřenost

- **Měří se výsledky práce, ne člověk:** žádná poloha GPS, žádné sledování kliknutí, času na
  obrazovce ani aktivity v telefonu. Stav „probíhá“ nastavuje zaměstnanec sám tlačítkem „Začít“.
- **Transparentnost:** zaměstnanec vidí na své kartě totéž co vedoucí, včetně štítků a výsledků.
  Před spuštěním dostane krátký informační dokument (účel, rozsah, kdo vidí, jak dlouho se
  uchovává). Odpovídá to informační povinnosti podle GDPR (čl. 13) a zásadě přiměřenosti
  kontroly zaměstnanců podle zákoníku práce (§ 316). Finální text doporučuji nechat zkontrolovat.
- **Minimalizace:** fotky dokládají práci, ne lidi (pokyn „fotit výsledek, ne osoby“),
  odstranění GPS z EXIF, retence s automatickým mazáním.
- **Přístup:** kartu zaměstnance vidí jen on sám, jeho přímý vedoucí a ADMIN.
- **Audit:** do historie jdou jen významné změny (kap. 3.3). Nic se nemaže, opravy jsou nové záznamy.

---

## 8. Otázky k rozhodnutí (Jaroslav Viner)

1. **Kdo vidí karty zaměstnanců:** jen ADMIN a přímý vedoucí (návrh), nebo i EXECUTIVE
   (Střelec, Königsbergová)?
2. **Role Blahouta:** je zároveň vedoucí bistra, tedy zadává a schvaluje úkoly zaměstnancům bistra,
   a zároveň dostává úkoly od Vinera? Návrh to podporuje.
3. **První zaměstnanci:** kdo, kolik lidí a mají vlastní chytrý telefon? Pokud bistro používá
   **sdílený tablet**, je potřeba rychlé přepínání osob (PIN). To je samostatná položka mimo odhad.
4. **Push notifikace už v první verzi,** nebo stačí zvonek v aplikaci a ranní e-mailový souhrn?
5. **Retence fotek:** 12 měsíců?
6. **Pořadí sloučení nesloučených větví** (provize, historie Denního volání, Google Kalendář) před Etapou 1.
7. **Úložiště:** souhlas s Cloudflare R2 (EU)?
