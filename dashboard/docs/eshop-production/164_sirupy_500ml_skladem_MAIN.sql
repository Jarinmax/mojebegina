DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

-- 1) 500 ml zpět skladem: Šaman, Ibiškový, Šípkový, Heřmánkový
UPDATE product_variants
SET sold_out = false, updated_at = now()
WHERE sku IN ('bylinny-sirup-saman-750ml', 'ibiskovy-sirup-750ml', 'sipkovy-sirup-750ml', 'hermankovy-sirup-750ml')
  AND volume_ml = 500
RETURNING sku, label, sold_out;

-- 2) 650 ml (doprodej, hlídané kusy) posunout za 500 ml
UPDATE product_variants
SET sort_order = 30, updated_at = now()
WHERE sku IN ('zazvorovy-sirup-750ml', 'lipovy-sirup-750ml', 'medunkovy-sirup-s-levanduli-750ml')
  AND volume_ml = 650
RETURNING sku, label, stock_qty;

-- 3) nová 500 ml za 159 Kč: Zázvorový, Lipový, Meduňkový s levandulí
INSERT INTO product_variants (product_id, sku, label, short_note, package_description, volume_ml, servings, price_b2c_kc, is_active, sort_order, weight_g, sold_out)
SELECT p.id, p.slug || '-500ml', '500 ml', 'Až 25 nápojů',
       '500 ml – lehké balení ve stříbrném sáčku se šroubovacím uzávěrem, vhodné pro menší spotřebu.',
       500, 25, 159, true, 20, 620, false
FROM products p
WHERE p.slug IN ('zazvorovy-sirup', 'lipovy-sirup', 'medunkovy-sirup-s-levanduli')
  AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.volume_ml = 500)
RETURNING sku, label, price_b2c_kc;
