-- NÁVRH ESHOP 1.0 — NESPOUŠTĚT BEZ SCHVÁLENÍ. Viz dashboard/ESHOP_SCHEMA_PROPOSAL.md.
-- Spouštět nejdřív na Neon branch, nikdy celou složku najednou.
-- Návrat kroku 2: smaže jen záznamy ze seedu (podle slug/sku). Selže (FK
-- RESTRICT), pokud na balení už odkazuje order_items — to je záměr.
DELETE FROM product_variants WHERE sku IN (
  'dynova-polevka', 'kulajda', 'rajcatova-polevka',
  'svarak-deluxe-3l', 'svarak-deluxe-500ml', 'lady-carneval-3l', 'lady-carneval-500ml',
  'granatovy-bond-3l', 'granatovy-bond-500ml', 'kosmopolitan-3l', 'kosmopolitan-500ml'
);
DELETE FROM products WHERE slug IN (
  'dynova-polevka', 'kulajda', 'rajcatova-polevka',
  'svarak-deluxe', 'lady-carneval', 'granatovy-bond', 'kosmopolitan'
); -- product_images se smažou kaskádou
DELETE FROM product_categories WHERE slug IN ('polevky', 'sirupy', 'caje', 'ovocne-napoje', 'koktejly');
