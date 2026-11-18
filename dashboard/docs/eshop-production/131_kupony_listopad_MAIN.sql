-- 131 + 132 (spuštěno 18. 11. 2026, Lucie): kupony ze starého e-shopu na listopad 2026.
--   listopad3 = 3 % pro Jiřího Průchu a Kavárnu Adélka, listopad8 = 8 % pro Tomáše Herouta.
-- Nový e-shop je neznal (od 15. 11. se partnerská úroveň počítá jen z objednávek e-shopu).
-- Platí jen pro uvedené e-maily, do 30. 11. 2026. Dá se spustit opakovaně.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.'; END IF;
END $$;
INSERT INTO eshop_coupons (code, discount_type, amount, free_shipping, expires_at, individual_use, email_restrictions, is_active, note)
VALUES
  ('listopad3', 'percent', 3, false, '2026-11-30 23:59:59+01', false, ARRAY['jir.prucha@seznam.cz', 'kavarnaadelka@gmail.com'], true,
   'Kupon ze starého e-shopu: 3 % na listopad 2026 pro Jiřího Průchu a Kavárnu Adélka (18. 11. 2026).'),
  ('listopad8', 'percent', 8, false, '2026-11-30 23:59:59+01', false, ARRAY['tom.herout@seznam.cz'], true,
   'Kupon ze starého e-shopu: 8 % na listopad 2026 pro Tomáše Herouta (18. 11. 2026).')
ON CONFLICT (code) DO UPDATE SET email_restrictions = EXCLUDED.email_restrictions, note = EXCLUDED.note;
COMMIT;
SELECT code, amount, email_restrictions, expires_at, is_active FROM eshop_coupons WHERE code IN ('listopad3', 'listopad8');
