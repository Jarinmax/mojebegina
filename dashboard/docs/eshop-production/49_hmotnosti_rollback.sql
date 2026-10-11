-- NÁVRAT hmotností: odstraní sloupec product_variants.weight_g (i s pojistkou
-- product_variants_weight_positive). Nespouštět automaticky.
-- Bezpečné i s nasazeným kódem: s ESHOP_WEIGHT_SHIPPING vypnutým e-shop
-- hmotnosti nečte; se zapnutým je bez sloupce nenajde a chlazenou přepravu
-- nenabídne (osobní odběr dál funguje). Objednávky se nemění — cena dopravy
-- je v nich uložená.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'weight_g') THEN
    RAISE EXCEPTION 'Sloupec product_variants.weight_g neexistuje — není co vracet.';
  END IF;
  ALTER TABLE product_variants DROP COLUMN weight_g;
END $$;
