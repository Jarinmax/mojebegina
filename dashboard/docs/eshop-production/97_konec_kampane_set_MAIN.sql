-- Konec zaváděcí kampaně Ochutnávkového setu (po 100 prodaných setech).
-- Cena 249 Kč, texty bez akce. ZÁROVEŇ vrátit ZASILKOVNA_PRICE_KC na 89
-- v lib/eshop/shipping.ts a nasadit. Spustit v Neon SQL Editoru na main.
BEGIN;
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;
END $$;
UPDATE "product_variants" SET "price_b2c_kc" = 249, "updated_at" = now()
  WHERE "sku" = 'ochutnavkovy-set-sirupu-5x100ml';
UPDATE "products" SET
  "short_description" = 'Pět bylinných sirupů po 100 ml na ochutnání – meduňka s levandulí, heřmánek, ibišek, lípa a zázvor. Až 25 nápojů.',
  "description" = array_replace("description",
    '**Zaváděcí cena 159 Kč a poštovné zdarma platí jen pro prvních 100 setů, pak bude set za 249 Kč.** Samotný Ochutnávkový set posíláme Zásilkovnou na výdejní místo nebo do Z-BOXu. Sirupy nepotřebují chlazení.',
    'Samotný Ochutnávkový set posíláme Zásilkovnou na výdejní místo nebo do Z-BOXu za 89 Kč. Sirupy nepotřebují chlazení.'),
  "highlights" = array_replace("highlights", 'poštovné zdarma', 'posíláme Zásilkovnou'),
  "updated_at" = now()
  WHERE "slug" = 'ochutnavkovy-set-sirupu';
-- Kontrola: SELECT v.price_b2c_kc FROM product_variants v WHERE v.sku = 'ochutnavkovy-set-sirupu-5x100ml';
COMMIT;
