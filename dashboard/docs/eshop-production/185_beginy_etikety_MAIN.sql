-- 185: černobílé obrázkové etikety 3 litry na všech fotkách s beginou (28 fotek)
BEGIN;
DO $$ BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev';
  END IF;
END $$;
UPDATE product_images SET url = '/eshop/sirupy/bylinny-sirup-saman-sacek-v2.jpg' WHERE url = '/eshop/sirupy/bylinny-sirup-saman-sacek.jpg';
UPDATE product_images SET url = '/eshop/sirupy/hermankovy-sirup-sacek-v2.jpg' WHERE url = '/eshop/sirupy/hermankovy-sirup-sacek.jpg';
UPDATE product_images SET url = '/eshop/sirupy/ibiskovy-sirup-sacek-v2.jpg' WHERE url = '/eshop/sirupy/ibiskovy-sirup-sacek.jpg';
UPDATE product_images SET url = '/eshop/sirupy/lipovy-sirup-sacek-v2.jpg' WHERE url = '/eshop/sirupy/lipovy-sirup-sacek.jpg';
UPDATE product_images SET url = '/eshop/sirupy/medunkovy-sirup-s-levanduli-sacek-v2.jpg' WHERE url = '/eshop/sirupy/medunkovy-sirup-s-levanduli-sacek.jpg';
UPDATE product_images SET url = '/eshop/sirupy/sipkovy-sirup-sacek-v2.jpg' WHERE url = '/eshop/sirupy/sipkovy-sirup-sacek.jpg';
UPDATE product_images SET url = '/eshop/sirupy/zazvorovy-sirup-sacek-v3.jpg' WHERE url = '/eshop/sirupy/zazvorovy-sirup-sacek.jpg';
UPDATE product_images SET url = '/eshop/caje/bylinny-caj-saman-begina-v2.jpg' WHERE url = '/eshop/caje/bylinny-caj-saman-begina.jpg';
UPDATE product_images SET url = '/eshop/caje/cerny-caj-golden-nepal-begina-v2.jpg' WHERE url = '/eshop/caje/cerny-caj-golden-nepal-begina.jpg';
UPDATE product_images SET url = '/eshop/caje/hermankovy-caj-begina-v2.jpg' WHERE url = '/eshop/caje/hermankovy-caj-begina.jpg';
UPDATE product_images SET url = '/eshop/caje/ibiskovy-caj-begina-v2.jpg' WHERE url = '/eshop/caje/ibiskovy-caj-begina.jpg';
UPDATE product_images SET url = '/eshop/caje/jasminovy-zeleny-caj-begina-v2.jpg' WHERE url = '/eshop/caje/jasminovy-zeleny-caj-begina.jpg';
UPDATE product_images SET url = '/eshop/caje/lipovy-caj-begina-v2.jpg' WHERE url = '/eshop/caje/lipovy-caj-begina.jpg';
UPDATE product_images SET url = '/eshop/caje/medunkovy-caj-s-levanduli-begina-v2.jpg' WHERE url = '/eshop/caje/medunkovy-caj-s-levanduli-begina.jpg';
UPDATE product_images SET url = '/eshop/caje/zazvorovy-caj-begina-v2.jpg' WHERE url = '/eshop/caje/zazvorovy-caj-begina.jpg';
UPDATE product_images SET url = '/eshop/koktejly/granatovy-bond-begina-v4.jpg' WHERE url = '/eshop/koktejly/granatovy-bond-begina-v3.jpg';
UPDATE product_images SET url = '/eshop/koktejly/kosmopolitan-begina-v4.jpg' WHERE url = '/eshop/koktejly/kosmopolitan-begina-v3.jpg';
UPDATE product_images SET url = '/eshop/koktejly/lady-carneval-begina-v5.jpg' WHERE url = '/eshop/koktejly/lady-carneval-begina-v4.jpg';
UPDATE product_images SET url = '/eshop/koktejly/svarak-deluxe-begina-v4.jpg' WHERE url = '/eshop/koktejly/svarak-deluxe-begina-v3.jpg';
UPDATE product_images SET url = '/eshop/ovocne-napoje/cervankove-nebe-begina-v4.jpg' WHERE url = '/eshop/ovocne-napoje/cervankove-nebe-begina-v3.jpg';
UPDATE product_images SET url = '/eshop/ovocne-napoje/dum-u-jezera-begina-v4.jpg' WHERE url = '/eshop/ovocne-napoje/dum-u-jezera-begina-v3.jpg';
UPDATE product_images SET url = '/eshop/ovocne-napoje/malinovy-svarak-nealko-begina-v4.jpg' WHERE url = '/eshop/ovocne-napoje/malinovy-svarak-nealko-begina-v3.jpg';
UPDATE product_images SET url = '/eshop/polevky/dynova-polevka-begina-v7.jpg' WHERE url = '/eshop/polevky/dynova-polevka-begina-v6.jpg';
UPDATE product_images SET url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-begina-v7.jpg' WHERE url = '/eshop/polevky/gulasova-polevka-z-hlivy-ustricne-begina-v6.jpg';
UPDATE product_images SET url = '/eshop/polevky/kulajda-begina-v7.jpg' WHERE url = '/eshop/polevky/kulajda-begina-v6.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-begina-v7.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-begina-v6.jpg';
UPDATE product_images SET url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-begina-v8.jpg' WHERE url = '/eshop/polevky/rajcatova-polevka-s-cervenou-repou-begina-v7.jpg';
UPDATE product_images SET url = '/eshop/polevky/spenatova-polevka-begina-v8.jpg' WHERE url = '/eshop/polevky/spenatova-polevka-begina-v7.jpg';
COMMIT;
