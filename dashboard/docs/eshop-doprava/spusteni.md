# Chlazená přeprava podle hmotnosti — spuštění (stav 11. 10. 2026)

Stav: **připraveno, nic nespuštěno.** Production dál účtuje orientační
paušál 99 Kč; migrace na Production neproběhla; přepínač nikde nezapnutý.
Obchodní podmínky a PDF (PR #19) beze změny.

## Rozhodnutí majitele (11. 10. 2026)

| Bod | Rozhodnutí | V kódu |
|---|---|---|
| Pásmo 100–150 kg | **1 839 Kč, zachovat** | `shippingRates.ts`, pravidlo 11 |
| Nad 150 kg | **individuální řešení, neúčtovat automaticky** | chlazená přeprava nedostupná + text s e-mailem a telefonem; osobní odběr zůstává |
| Hmotnosti | **v katalogu u každého SKU, v gramech** | `product_variants.weight_g` (migrace 0021) |
| Doprava zdarma | **NEOVĚŘENO — otevřená otázka** | **neimplementováno** (viz níže) |

## ⚠ Otevřená otázka před spuštěním: doprava zdarma

Ve WooCommerce chybí na screenshotech horní část nastavení Flexible Shipping
(`instance_id=25`), kde bývá „doprava zdarma od částky“. Nevíme, zda
begina.cz dopravu zdarma nabízí. **Kód ji nepočítá** (žádná hranice, žádný
text „zdarma od“; test to hlídá). Před zapnutím přepínače je potřeba
potvrdit: buď „doprava zdarma není“, nebo přesné pravidlo (částka, zda
včetně dopravy, zda platí i nad 150 kg) — pak doplnit kód a testy.

## Jak to funguje

- Přepínač **`ESHOP_WEIGHT_SHIPPING=on`** (Vercel, Environment Variables).
  Jiná hodnota / nenastaveno = dosavadní paušál 99 Kč (výchozí všude).
- Hmotnost košíku = Σ (hmotnost balení × kusy) z katalogu v DB; cena podle
  11 pásem WooCommerce. Počítá jen server (`priceCart`); pokladna ukazuje
  stejný výpočet (`quoteShipping`), ale do objednávky jde cena ze serveru.
- **Nad 150 kg** nebo **položka bez hmotnosti** → volba „Chlazená přeprava“
  je zakázaná, u ní text „domluvíme individuálně — info@begina.cz,
  +420 774 199 975, případně osobní vyzvednutí ve Viticích“; tlačítko
  Objednat je zakázané, dokud je vybraná. Server takovou objednávku odmítne
  i při podvrženém formuláři.
- **Osobní vyzvednutí** (Vitice 119) zdarma vždy.
- **Jen Česká republika:** PSČ musí začínat 1–7 (česká). Slovenská
  (0xx, 8xx, 9xx) odmítnuta: „Doručujeme jen v České republice“. Platí
  v obou režimech (WooCommerce měl také jen zónu ČR).
- Stránka **Doprava a platba** v režimu podle hmotnosti ukazuje celý ceník
  z `shippingRates.ts` a pravidlo nad 150 kg.
- **Náhradní objednávka** (MojeBegina) počítá dopravu stejnou funkcí.
- Katalog čte hmotnosti samostatným dotazem jen se zapnutým přepínačem.
  Chybí-li sloupec (migrace neproběhla), e-shop běží dál a chlazená
  přeprava se v režimu podle hmotnosti nenabídne — žádný pád.

## Hmotnosti (36 aktivních SKU, zdroj WooCommerce, čteno 11. 10. 2026)

| Balení | Hmotnost | SKU |
|---|---|---|
| polévky 3 l | 3 000 g | 6 |
| čaje 3 l | 3 000 g | 8 |
| sirupy 3 l | 3 000 g | 7 |
| sirupy 750 g | 750 g | 7 |
| koktejly 3 l | 3 000 g | 4 |
| koktejly 500 ml | 500 g | 4 |

Přesný seznam: `docs/eshop-production/41_hmotnosti.sql`. Skrytá balení
(Ovocné nápoje) zůstávají bez hmotnosti; **Dům u jezera** ji ve WooCommerce
nemá — nutné doplnit před jeho zveřejněním.

## Soubory

- `drizzle/0021_eshop_1_0_variant_weight.sql` — sloupec `weight_g` + CHECK > 0
  (POZOR: PR #15 Sklad má vlastní 0021–0023 → kdo se slučuje druhý, přečísluje).
- `docs/eshop-production/40_hmotnosti_before.sql` — kontrola před (čtení).
- `docs/eshop-production/41_hmotnosti.sql` — sloupec + 36 hmotností, jedna
  transakce, pojistky (sloupec už existuje / SKU chybí → nic se nezmění).
- `docs/eshop-production/42_hmotnosti_after.sql` — kontrola po (čtení).
- `docs/eshop-production/49_hmotnosti_rollback.sql` — odstraní sloupec.
- Kód: `lib/eshop/shipping.ts` (režim, `quoteShipping`), `shippingRates.ts`,
  `pricing.ts`, `checkout.ts` (PSČ), `catalogDb.ts`, `app/eshop/pokladna/*`,
  `app/eshop/doprava/page.tsx`, `lib/data/orders.ts` + `ReplacementOrderForm.tsx`.
- Testy: `shippingRates.test.ts`, `weightShipping.test.ts` (balíček SQL,
  katalog, hranice, součty SKU, osobní odběr, PSČ, cena na serveru až do
  uložené objednávky), `CancelledMoneyPanel.test.tsx`.

## Postup (každý krok jen se souhlasem majitele)

### A. Preview (izolovaná Neon větev `preview/claude/great-bell-ffjwo3-doprava`)

1. Neon Console → větev `preview/claude/great-bell-ffjwo3-doprava` → SQL
   Editor: spustit `40_hmotnosti_before.sql` → čekám `0 | 36 | 36 | 0`.
2. Spustit celý `41_hmotnosti.sql`.
3. Spustit `42_hmotnosti_after.sql` → čekám `1 | 36 | 0 | 25 | 7 | 4 | 0`.
4. Vercel → Settings → Environment Variables: `ESHOP_WEIGHT_SHIPPING` = `on`,
   prostředí **Preview**, větev `claude/great-bell-ffjwo3-doprava` → Redeploy
   Preview.
5. Vyzkoušet pokladnu: 1× polévka → 267 Kč; 5× 3 l → 379 Kč; 51× 3 l →
   chlazená přeprava nedostupná s textem; osobní odběr 0 Kč; PSČ 811 01
   odmítnuto.

### B. Production (až po schválení)

1. Vyřešit otevřenou otázku dopravy zdarma.
2. `40` → `41` → `42` na Production (main) — sloupec je přídavný, stávající
   kód ho nečte, takže nic neovlivní.
3. Sloučit PR (kód s vypnutým přepínačem = beze změny chování, kromě
   kontroly českého PSČ).
4. Zapnout `ESHOP_WEIGHT_SHIPPING=on` pro Production + Redeploy.
5. Návrat: vypnout přepínač (okamžitě zpět na paušál); sloupec lze
   odstranit `49_hmotnosti_rollback.sql`.
