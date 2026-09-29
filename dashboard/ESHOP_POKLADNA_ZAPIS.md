# ESHOP 1.0 — pokladna ukládá objednávky (jen Preview)

Stav (28. 9. 2026): implementováno na větvi `claude/great-bell-ffjwo3`.
**Žádná nová migrace** — využívá tabulky a sloupce z migrací 0012–0018,
které už jsou na Preview větvi Neonu. Produkční `main` beze změny.

## Co se děje po kliknutí na „Objednat“

1. Server ověří formulář a spočítá cenu z katalogu v DB (jako dosud).
2. **Jen mimo Vercel Production** (`isOrderWriteEnabled`: `VERCEL_ENV !=
   production`, nebo v Production výslovně `ESHOP_ORDER_WRITE=on`) se
   v jedné transakci (`db.batch`) zapíše:
   - `orders`: `channel = eshop`, **bez organizace**, jméno/telefon/**e-mail**
     (povinný), adresa u rozvozu, způsob doručení a platby (kód + název),
     poznámka zákazníka, `subtotal/discount 0/shipping/total`,
     **`fulfillment_status = new`, `payment_status = unpaid`** (stejně jako
     nová ruční objednávka), `terms_accepted_at`, `age_confirmed_at` jen
     u alkoholu, **`order_number` NULL** (číslování vypnuté);
   - `order_items`: vazba na `product_variants` + **kopie SKU, názvu a ceny**
     z okamžiku objednávky;
   - `order_activity`: systémový záznam (`actor_type = system`, autor
     „E-shop“, bez uživatele), `kind = created`.
3. Před zápisem se u každého balení ověří, že v DB existuje, je aktivní
   a má stejnou cenu jako v košíku; jinak se nic neuloží.
4. Formulář posílá token (UUID) = id objednávky → dvojklik ani opakované
   odeslání nevytvoří druhou objednávku. Skryté pole proti robotům.
5. Zákazník vidí potvrzení s referencí (prvních 8 znaků id). **Žádná
   platba, žádný e-mail.**

V Production (`moje.begina.cz`) se nic neukládá — zákazník vidí jen
rekapitulaci „Náhled“, jako dosud (ověřeno v prohlížeči).

MojeBegina: detail objednávky nově ukazuje doručení + adresu, platbu,
poznámku zákazníka a potvrzení 18+ (jen když údaje existují — ruční
objednávky beze změny) a „Objednávka z e-shopu“. V seznamu je objednávka
jako „Soukromý zákazník“ + jméno, v dlaždici „Nové“.

## První testovací objednávka (Preview)

Výchozí stav Preview DB (read-only 28. 9.): 3 objednávky (0 z e-shopu),
6 položek, 4 záznamy historie.

1. Ve Vercelu ověřit, že nasazení větve `claude/great-bell-ffjwo3` s tímto
   commitem je Ready.
2. `https://mojebegina-git-claude-great-bell-ffjwo3-jarin-max.vercel.app/eshop`
   — nahoře musí být „Testovací provoz: objednávky se ukládají…“.
3. Do košíku: Čerstvé polévky → Kulajda; Alkoholické koktejly → Svařák
   Deluxe → 500 ml.
4. Košík → Pokračovat k objednávce. Jméno „TEST Jaroslav“, **vlastní
   e-mail**, telefon, Chlazená přeprava + adresa, poznámka „TEST — nevyřizovat“,
   zaškrtnout 18+ a obchodní podmínky → Objednat.
5. Potvrzení „Testovací provoz: objednávka je uložená… (reference xxxxxxxx)“.
6. MojeBegina (stejná Preview adresa) → Řízení firmy: dlaždice Nové = 1 →
   Objednávky: „Soukromý zákazník“, TEST Jaroslav, 379 + 129 + 99 = 607 Kč →
   detail: doručení, adresa, platba, poznámka, 18+, historie „E-shop
   založil(a) objednávku“.
7. Kontrola v Neonu (jen čtení), očekáváno: 4 / 1 / 8 / 5 a u položek
   vazba_ok = true:

   ```sql
   SELECT (SELECT count(*) FROM orders) AS objednavky,
          (SELECT count(*) FROM orders WHERE channel = 'eshop') AS eshop,
          (SELECT count(*) FROM order_items) AS polozky,
          (SELECT count(*) FROM order_activity) AS aktivita;
   ```

   ```sql
   SELECT o.contact_name, o.total_kc, o.fulfillment_status, o.payment_status, o.order_number,
          i.sku_snapshot, i.name, i.unit_price_kc, v.sku = i.sku_snapshot AS vazba_ok
   FROM orders o JOIN order_items i ON i.order_id = o.id
   JOIN product_variants v ON v.id = i.product_variant_id
   WHERE o.channel = 'eshop' ORDER BY o.ordered_at DESC, i.sku_snapshot;
   ```

## Ověřeno (bez Neonu)

- 299/299 testů (+10): sestavení řádků (snapshoty, stavy, bez čísla,
  18+ jen u alkoholu, osobní odběr bez adresy), povolení zápisu (Preview
  ano, Production ne, Production + `ESHOP_ORDER_WRITE=on` ano), token;
  **skutečný zápis přes ovladač Neonu (`db.batch`) nad PGlite** se všemi
  migracemi: objednávka + položky napojené na balení + systémový záznam;
  dvojí odeslání = 1 objednávka; změněná cena = nic se neuloží; chyba
  uprostřed = celá transakce se vrátí. Detail objednávky vrací údaje
  z pokladny, ruční objednávky beze změny.
- Prohlížeč (Playwright, mobil + desktop, dvojklik na „Objednat“) proti
  aplikaci nad DB v paměti: režim Preview uloží 2 objednávky / 4 položky /
  2 systémové záznamy, režim Production 0; bez chyb v konzoli.
- Typecheck, lint, `next build`.

## Co zatím chybí (další kroky)

Platební brána / QR platba, potvrzovací e-mail zákazníkovi a upozornění
Begině, číslo objednávky (krok 6b v den přepnutí), rate limit, texty
obchodních podmínek, ceník dopravy podle objemu.
