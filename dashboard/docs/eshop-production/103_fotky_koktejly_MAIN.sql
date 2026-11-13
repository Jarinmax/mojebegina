-- 103: Nové hlavní fotky alkoholických koktejlů; staré fotky se u nich mažou.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE slug IN ('lady-carneval','granatovy-bond','svarak-deluxe','kosmopolitan'));
INSERT INTO product_images (product_id, url, alt, sort_order)
SELECT p.id, v.url, v.alt, 0 FROM products p JOIN (VALUES
  ('lady-carneval','/eshop/koktejly/lady-carneval-hlavni.jpg','Lady Carneval – sklenice s ledem, růžový grep, citron a bylinky'),
  ('granatovy-bond','/eshop/koktejly/granatovy-bond-hlavni.jpg','Granátový Bond – sklenice s ledem, granátové jablko, citron a máta'),
  ('svarak-deluxe','/eshop/koktejly/svarak-deluxe-hlavni.jpg','Svařák Deluxe – horký svařák ve skleněném hrnku s pomerančem a kořením'),
  ('kosmopolitan','/eshop/koktejly/kosmopolitan-hlavni.jpg','Kosmopolitan – martini sklenice s brusinkami, grep, citron a jablko')
) AS v(slug,url,alt) ON v.slug = p.slug;
SELECT p.slug, i.sort_order, i.url, i.alt FROM product_images i JOIN products p ON p.id=i.product_id
WHERE p.slug IN ('lady-carneval','granatovy-bond','svarak-deluxe','kosmopolitan') ORDER BY 1,2;
COMMIT;
