-- 109: Lady Carneval ve sklenici na víno (3 fotky), nový Malinový svařák nealko (2 fotky), hustší gulášová s beginou.
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/koktejly/lady-carneval-hlavni-v2.jpg', alt = 'Lady Carneval – sklenice na víno s ledem, růžový grep, citron a bylinky' WHERE url LIKE '/eshop/koktejly/lady-carneval-hlavni%';
UPDATE product_images SET url = '/eshop/koktejly/lady-carneval-begina-v4.jpg' WHERE url LIKE '/eshop/koktejly/lady-carneval-begina%';
UPDATE product_images SET url = '/eshop/koktejly/lady-carneval-sacek-v2.jpg' WHERE url LIKE '/eshop/koktejly/lady-carneval-sacek%';
UPDATE product_images SET url = '/eshop/ovocne-napoje/malinovy-svarak-nealko-hlavni-v2.jpg', alt = 'Malinový svařák nealko – horký nápoj ve skleněném hrnku s malinami, pomerančem a kořením' WHERE url = '/eshop/ovocne-napoje/malinovy-svarak-nealko-hlavni.jpg';
UPDATE product_images SET url = '/eshop/ovocne-napoje/malinovy-svarak-nealko-begina-v2.jpg' WHERE url = '/eshop/ovocne-napoje/malinovy-svarak-nealko-begina.jpg';
UPDATE product_images SET url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-begina.jpg' WHERE url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-sacek.jpg';
COMMIT;
