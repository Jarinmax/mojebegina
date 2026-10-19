-- UDĚLENÍ oprávnění customer_card_preview přesně 4 členům vedení — podle
-- user_id (ověřeno čtením 19. 10. 2026), NIKDY podle jména či e-mailu.
-- Spuštění NESCHVÁLENO. Předpoklad: 11_migration.sql.
-- Pojistky: každé user_id musí existovat a mít roli ADMIN nebo EXECUTIVE;
-- už aktivní udělení se neopakuje. Uděluje Jaroslav Viner.
DO $$
DECLARE
  granted_by constant text := 'de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c'; -- Jaroslav Viner
  members constant text[] := ARRAY[
    'de1d8bf9-460a-4ad7-8f67-9d7e43f2eb2c', -- Jaroslav Viner
    'f9f93f03-92b0-4724-becd-c0a3576b5275', -- Lucie Königsbergová
    'fdc7b836-2325-4568-b9b7-5ac579cd8972', -- Jiří Střelec
    '06240ac4-c050-47ea-998c-6c81389edf9f'  -- Jaroslav Blahout
  ];
  m text;
BEGIN
  FOREACH m IN ARRAY members LOOP
    IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = m) THEN
      RAISE EXCEPTION 'Účet % neexistuje — zastavuji, nic se neudělilo.', m;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = m AND system_role IN ('ADMIN', 'EXECUTIVE')) THEN
      RAISE EXCEPTION 'Účet % nemá roli ADMIN ani EXECUTIVE — zastavuji, nic se neudělilo.', m;
    END IF;
    INSERT INTO user_permissions (user_id, permission, granted_by_user_id, reason)
    VALUES (m, 'customer_card_preview', granted_by, 'Člen vedení — náhled zákaznické karty (19. 10. 2026)')
    ON CONFLICT (user_id, permission) WHERE revoked_at IS NULL DO NOTHING;
  END LOOP;
END $$;

-- Kontrola (jen čtení): aktivní udělení
SELECT p.user_id, pr.name, p.granted_at
FROM user_permissions p LEFT JOIN user_profiles pr ON pr.user_id = p.user_id
WHERE p.permission = 'customer_card_preview' AND p.revoked_at IS NULL
ORDER BY pr.name;
