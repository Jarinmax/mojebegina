-- PRODUCTION — kontrola PO zapnutí číslování (jen čtení).
-- Očekáváno: 1 | 1 | 1 | 2 | 0 | <START> | <START>+1 (= další číslo)
-- (pokud mezitím vznikly ruční objednávky, posledni_pridelene = START + jejich počet)
SELECT
 (SELECT count(*) FROM pg_class WHERE relname='order_number_seq') AS sekvence,
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='order_number' AND column_default LIKE 'nextval%') AS vychozi_hodnota,
 (SELECT count(*) FROM pg_constraint WHERE conname='orders_number_required') AS check_cislo,
 (SELECT count(*) FROM orders WHERE channel='import' AND order_number IS NULL) AS import_bez_cisla,
 (SELECT count(*) FROM orders WHERE channel<>'import' AND order_number IS NULL) AS ostatni_bez_cisla,
 (SELECT last_value FROM pg_sequences WHERE sequencename='order_number_seq') AS posledni_pridelene,
 (SELECT last_value + 1 FROM pg_sequences WHERE sequencename='order_number_seq') AS dalsi_cislo;
