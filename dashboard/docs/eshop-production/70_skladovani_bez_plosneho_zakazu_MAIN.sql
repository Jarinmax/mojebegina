-- Údaje o skladování u polévek a čajů: místo plošné věty „Výrobek podléhá
-- rychlé zkáze, a nelze jej vrátit po zakoupení.“ (vylučovala by i reklamaci)
-- znění podle čl. VII obchodních podmínek (3. znění, 6. 11. 2026):
-- výjimka z odstoupení podle § 1837 písm. e) OZ, reklamace vadného zboží
-- tím není dotčena. Mění JEN větu na konci storage_instructions, nic jiného.
--
-- SPUSTIT AŽ PO SCHVÁLENÍ MAJITELEM, v Neon SQL Editoru na větvi main.
-- Jeden blok = jedna transakce: když cokoli nesedí, nezmění se nic.
DO $$
DECLARE
  changed int;
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Toto není Production main — zastavuji, nic se nezměnilo.';
  END IF;

  UPDATE products p
  SET storage_instructions = replace(
        p.storage_instructions,
        'Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.',
        'Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena.'
      ),
      updated_at = now()
  FROM product_categories c
  WHERE c.id = p.category_id
    AND c.slug IN ('polevky', 'caje')
    AND p.storage_instructions LIKE '%Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.';
  GET DIAGNOSTICS changed = ROW_COUNT;

  IF changed <> 14 THEN
    RAISE EXCEPTION 'Čekám 14 produktů (6 polévek, 8 čajů), našel jsem % — zastavuji, nic se nezměnilo.', changed;
  END IF;
  RAISE NOTICE 'Hotovo: 14 produktů s upraveným údajem o skladování.';
END $$;

-- Návrat:
-- UPDATE products p SET storage_instructions = replace(p.storage_instructions,
--   'Výrobek podléhá rychlé zkáze, proto se na něj nevztahuje právo na odstoupení od smlouvy (čl. VII obchodních podmínek). Reklamace vadného zboží tím není dotčena.',
--   'Výrobek podléhá rychlé zkáze, a nelze jej vrátit po zakoupení.'), updated_at = now()
-- FROM product_categories c WHERE c.id = p.category_id AND c.slug IN ('polevky', 'caje');
