-- 151: Ochutnávka polévek 3 × 450 ml – hlavní fotka a trvanlivost podle etikety 450 ml (Lucie 24. 11. 2026).
-- Spouštět v Neon → SQL Editor → větev main → Run. Jde spustit znovu (nic nezdvojí).
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

INSERT INTO product_images (product_id, url, alt, sort_order)
SELECT p.id, '/eshop/polevky/ochutnavka-polevek-3x450.jpg', 'Ochutnávka polévek 3 × 450 ml – tři sáčky s polévkou a miska dýňové polévky', 0
FROM products p
WHERE p.slug = 'ochutnavka-polevek-3x450'
  AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id AND i.url = '/eshop/polevky/ochutnavka-polevek-3x450.jpg');

UPDATE products
SET shelf_life_note = 'Neotevřený sáček spotřebujte do data „Spotřebujte do“ uvedeného na sáčku. Po otevření spotřebujte do 5 dnů při dodržení podmínek skladování, nejpozději však do data „Spotřebujte do“ na sáčku.'
WHERE slug = 'ochutnavka-polevek-3x450';

SELECT p.name, p.shelf_life_note, i.url
FROM products p LEFT JOIN product_images i ON i.product_id = p.id
WHERE p.slug = 'ochutnavka-polevek-3x450';
